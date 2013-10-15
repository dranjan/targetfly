var http = require('http');
var url = require('url');

var fs = require('fs');
var spawn = require('child_process').spawn;
var jade = require('jade');
var program = require('commander');
var inspect = require('util').inspect;
var path = require('path');
var async = require('async');
var mime = require('mime');

var recursiveSize = require('./recursiveSize');
var formatting = require('./formatting');


var pkg = JSON.parse(fs.readFileSync(path.join(__dirname,
                                               "package.json")));
var version = pkg.version;

program.version(version);
program.option('-p, --port [N]', 'port to listen on [8080]', 8080);
program.option('-d, --directory [PATH]',
               'directory to serve [.]', '.');
program.option('--show-hidden',
               'serve hidden files (affects TAR downloads as well)');
program.option('--show-backup',
               'serve backup files (#* and *~) ' +
               '(affects TAR downloads as well)');
program.option('--tar [PROGRAM]', 'choose \'tar\' binary', 'tar');

program.parse(process.argv);

var port = program.port;
var root = program.directory;
var showHidden = program.showHidden;
var showBackup = program.showBackup;
var tar = program.tar;

var views = path.join(__dirname, 'views');
var meta = path.join(__dirname, "meta");

function serve(port) {
    function onRequest(request, response) {
        console.log(request.connection.remoteAddress + ':' +
                    request.connection.remotePort + " " +
                    request.method + " " + request.url);

        var requestUrl = url.parse(request.url);
        var pathname = requestUrl.pathname;

        if (redirects[pathname]) {
            response.redirect(redirects[pathname]);
        } else {
            var components = pathname.split('/');
            var handler = routes[components[1]];
            if (handler) {
                handler(components.slice(2).join('/'), response);
            } else {
                response.error404();
            }
        }
    }

    http.createServer(onRequest).listen(port);
    console.log("Serving " + root + " on port " + String(port) + "...");
}

http.ServerResponse.prototype.render = function (view, locals) {
    var renderLocals = {
        version: version,
        platform: process.platform,
        arch: process.arch,
        node_version: process.version,
        formatSize: formatting.formatSize,
        formatDateFull: formatting.formatDateFull
    };

    for (var k in locals) {
        renderLocals[k] = locals[k];
    }

    var res = this;
    function writeHtml(err, html) {
        if (err) {
            res.status = 500;
            console.log(err);
            res.end();
        } else {
            res.status = 200;
            res.writeHead(200, {
                'Content-Type': 'text/html',
                'Content-Length': html.length
            });
            res.end(html);
        }
    };

    jade.renderFile(path.join(views, view + '.jade'),
                    renderLocals,
                    writeHtml);
};

http.ServerResponse.prototype.redirect = function (location) {
    this.writeHead(302, {'Location': location});
    this.end();
};

http.ServerResponse.prototype.genericError = function (err) {
    var errStr = inspect(err);
    console.log(errStr);
    var s = err.status || 500;
    if (s === 404) {
        this.error404();
    } else {
        this.statusCode = s;
        this.render('error', {code:s, message:errStr});
    }
};

http.ServerResponse.prototype.error404 = function () {
    this.statusCode = 404;
    this.render('404');
};

function httpError(code) {
    var err = new Error(http.STATUS_CODES[code]);
    err.status = code;
    return err;
};

var redirects = {
    '/browse': '/browse/',
    '/download': '/download/',
    '/': '/browse/'
};

function validatePath(pathname) {
    var components = pathname.split('/');

    for (var i in components) {
        if (exclude_component(components[i])) {
            return false;
        }
    }
    return true;
}


function exclude_component(f) {
    if (f === '.' || f === '..') return true;
    if (!showHidden && (f[0] === '.')) return true;
    if (!showBackup && (f[0] === '#' || f[f.length-1] === '~')) {
        return true;
    }

    return false;
}

routes = {
    'browse': function (pathname, response) {
        if (!validatePath(pathname)) {
            response.error404();
            return;
        }

        var truePath = path.resolve(root, pathname);
        fs.stat(truePath, function (err, stats) {
            if (err) {
                response.error404();
            } else if (stats.isDirectory()) {
                var dirpath = '/' + pathname;
                if (dirpath[dirpath.length-1] !== '/') {
                    dirpath = dirpath + '/';
                }

                dirInfo(truePath, function (err, files) {
                    if (err) {
                        response.genericError(err);
                    } else {
                        response.render('directory', {
                            files: files,
                            path: dirpath,
                            date: new Date()
                        });
                    }
                });
            } else {
                sendFile(truePath, response);
            }
        });
    },

    'download': function (pathname, response) {
        if (!validatePath(pathname)) {
            response.error404();
            return;
        }

        var truePath = path.resolve(root, pathname);
        fs.stat(truePath, function (err, stats) {
            if (err) {
                response.error404();
            } else if (stats.isDirectory()) {
                sendTar(truePath, response);
            } else {
                sendFile(truePath, response, true);
            }
        });
    },

    'meta': function (pathname, response) {
        var components = pathname.split('/');
        for (var i in components) {
            c = components[i];
            if (c[0] === '.' ||
                c[0] === '#' || c[c.length-1] === '~')
            {
                response.error404();
            }
        }

        var truePath = path.resolve(meta, pathname);

        fs.stat(truePath, function(err, stats) {
            if (err) {
                response.error404();
            } else if (stats.isDirectory()) {
                response.genericError(httpError(403));
            } else {
                sendFile(truePath, response);
            }
        });
    },

    'measure': function (pathname, response) {
        if (!validatePath(pathname)) {
            response.error404();
            return;
        }

        var truePath = path.resolve(root, pathname);
        recursiveSize(truePath, function (dirname, filename) {
            return !exclude_component(filename);
        },
        function (err, sz, nf, nd) {
            if (err) {
                response.error404();
            } else {
                response.writeHead(200, {
                    'Content-Type': 'application/json'
                });
                response.end(JSON.stringify({
                    size : sz,
                    numFiles: nf,
                    numDirectories: nd
                }));
            }
        });
    }
};


/* callback is callback(err, files), where files is an array whose
 * entries are {name:filename, stat:stats}.  The 'stat' field can be
 * null (if stat-ing the file failed).  The array contains an entry for
 * each non-excluded file in the top level of the given directory.
 */
function dirInfo(dirpath, callback) {
    function fileInfo(filename, callback) {
        var tasks = {};
        var filepath = path.join(dirpath, filename);

        tasks.name = function (callback) {
            callback(null, filename);
        };

        tasks.stats = function (callback) {
            fs.stat(filepath, function (err, stats) {
                if (err) {
                    callback(null, null);
                } else {
                    callback(null, stats);
                }
            });
        };

        tasks.readable = function (callback) {
            fileReadable(filepath, callback);
        };

        async.parallel(tasks, callback);
    }

    fs.readdir(dirpath, function (err, files) {
        if (err) {
            callback(err);
        } else {
            async.filter(files, function (item, fn) {
                fn(!exclude_component(item));
            },
            function (files) {
                async.map(files, fileInfo, callback);
            });
        }
    });
}

function fileReadable(filename, callback) {
    fs.open(filename, "r", function (err, fd) {
        if (err) {
            callback(null, false);
        } else {
            fs.close(fd, function (err) {
                if (err) callback(err);
                else callback(null, true);
            });
        }
    });
}

function sendFile(filepath, response, attach) {
    var filename = path.basename(filepath);

    try {
        var file = fs.createReadStream(filepath);
    } catch (err) {
        reponse.error404();
    }

    response.statusCode = 200;
    response.setHeader('Content-Type', mime.lookup(filepath));

    if (attach) {
        response.setHeader("Content-Disposition",
                           "attachment; filename=" + filename);
    }

    file.on('error', function (err) {
        if (!response.headerSent) {
            response.removeHeader("Content-Type");
            response.removeHeader("Content-Disposition");
            response.genericError(httpError(500));
        }
    });

    file.pipe(response);
}

function sendTar(dirpath, response) {
    var cd = path.dirname(dirpath);
    var filename = path.basename(dirpath);
    var tarname = filename + ".tar";

    var tar_opts = ["-c", "-C", cd];

    if (!showHidden) {
        tar_opts.push('--exclude');
        tar_opts.push('.*');
    }

    if (!showBackup) {
        tar_opts.push('--exclude');
        tar_opts.push('#*');
        tar_opts.push('--exclude');
        tar_opts.push('*~');
    }

    tar_opts.push(filename);

    try {
        var child = spawn(tar, tar_opts);
    } catch (err) {
        response.genericError(httpError(500));
    }

    response.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": "attachment; filename=" + tarname
    });

    function error(err) {
        if (!response.headerSent) {
            response.removeHeader("Content-Type");
            response.removeHeader("Content-Disposition");
            response.genericError(httpError(500));
        }
    }

    child.on('error', error);

    /* not sure if this is needed */
    child.stdout.on('error', error);

    child.stdout.pipe(response);
}

serve(port);
