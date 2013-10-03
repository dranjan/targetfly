var express = require('express');
var fs = require('fs');
var spawn = require('child_process').spawn;
var jade = require('jade');
var program = require('commander');
var inspect = require('util').inspect;
var path = require('path');
var http = require('http');
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
program.option('--tar [PROGRAM]', 'choose \'tar\' binary', 'tar');

program.parse(process.argv);

var port = program.port;
var root = program.directory;
var show_hidden = program.showHidden;
var tar = program.tar;

var app = express();

var meta = path.join(__dirname, "views");

app.locals({
    version: version,
    platform: process.platform,
    arch: process.arch,
    node_version: process.version,
    formatSize: formatting.formatSize,
    formatDateFull: formatting.formatDateFull
});

app.use(express.logger('dev'));

app.set('views', __dirname + '/views');
app.engine('.jade', jade.renderFile);
app.set('view engine', 'jade');

if (show_hidden) {
    var exclude_component = function (f) {
        return f === '.' || f === '..';
    }
} else {
    var exclude_component = function (f) {
        return f[0] === '.';
    }
}

/* This middleware will refuse to serve any paths with a component
 * beginning with '.', which prohibits hidden files (and by implication,
 * upward directory traversal).
 */
app.all('*', function (request, response, next) {
    var pathname = request.path;
    var components = pathname.split('/');
    var valid = true;

    for (var i in components) {
        if (exclude_component(components[i])) {
            valid = false;
            error404(response);
        }
    }

    if (valid) next();
});

app.get('/', function (request, response) {
    response.redirect('/browse/');
});

/* app.get('/browse', function(request, response) {
    response.redirect('/browse/');
});

app.get('/download', function(request, response) {
    response.redirect('/download/');
}); */

app.get(/^\/browse\/(.*)/, function (request, response) {
    var pathname = path.resolve(root, request.params[0]);
    fs.stat(pathname, function (err, stats) {
        if (err) {
            error404(response);
        } else if (stats.isDirectory()) {
            var dirpath = '/' + request.params[0];
            if (dirpath[dirpath.length-1] !== '/') {
                dirpath = dirpath + '/';
            }

            dirInfo(pathname, function (err, files) {
                if (err) {
                    genericError(response, err);
                } else {
                    response.render('directory', 
                                    {files: files, path: dirpath,
                                     date: new Date()});
                }
            });
        } else {
            sendFile(pathname, response);
        }
    });
});

app.get(/^\/download\/(.*)/, function(request, response) {
    var pathname = path.resolve(root, request.params[0]);
    fs.stat(pathname, function (err, stats) {
        if (err) {
            error404(response);
        } else if (stats.isDirectory()) {
            sendTar(pathname, response);
        } else {
            sendFile(pathname, response, true);
        }
    });
});

app.get(/^\/meta\/(.*)/, function(request, response) {
    var pathname = path.resolve(meta, request.params[0]);
    fs.stat(pathname, function(err, stats) {
        if (err) {
            error404(response);
        } else if (stats.isDirectory()) {
            genericError(response, httpError(403));
        } else {
            sendFile(pathname, response);
        }
    });
});


app.get(/^\/measure\/(.*)/, function (request, response) {
    var pathname = path.resolve(root, request.params[0]);
    recursiveSize(pathname, function (dirname, filename) {
        return !exclude_component(filename);
    },

    function (err, sz, nf, nd) {
        if (err) {
            error404(response);
        } else {
            response.status(200);
            response.type('application/json');
            response.end(JSON.stringify({
                size : sz,
                numFiles: nf,
                numDirectories: nd
            }));
        }
    });
});


app.use(function (request, response) {
    error404(response);
});

/* callback is callback(err, files), where files is an array whose
 * entries are {name:filename, stat:stats}.  The 'stat' field can be
 * null (if stat-ing the file failed).  The array contains an entry for
 * each non-hidden file in the top level of the given directory.
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
        error404(response);
    }

    response.status(200);
    response.type(mime.lookup(filepath));

    if (attach) {
        response.set({
            "Content-Disposition": "attachment; filename=" + filename
        });
    }

    file.on('error', function (err) {
        if (!response.headerSent) {
            response.removeHeader("Content-Type");
            response.removeHeader("Content-Disposition");
            genericError(response, httpError(500));
        }
    });

    file.pipe(response);
}

function sendTar(dirpath, response) {
    var cd = path.dirname(dirpath);
    var filename = path.basename(dirpath);
    var tarname = filename + ".tar";

    var tar_opts = ["-c", "-C", cd];

    if (!show_hidden) {
        tar_opts.push('--exclude');
        tar_opts.push('.*');
    }

    tar_opts.push(filename);

    try {
        var child = spawn(tar, tar_opts);
    } catch (err) {
        genericError(response, httpError(500));
    }

    response.status(200);
    response.set({
        "Content-Type": "application/octet-stream",
        "Content-Disposition": "attachment; filename=" + tarname
    });

    function error(err) {
        if (!response.headerSent) {
            response.removeHeader("Content-Type");
            response.removeHeader("Content-Disposition");
            genericError(response, httpError(500));
        }
    }

    child.on('error', error);

    /* not sure if this is needed */
    child.stdout.on('error', error);

    child.stdout.pipe(response);
}

function genericError(response, err) {
    var errStr = inspect(err);
    console.log(errStr);
    var s = err.status || 500;
    if (s === 404) error404(response);
    else response.status(s).render('error', {code:s, message:errStr});
}

function error404(response) {
    response.status(404).render('404');
}

function httpError(code) {
    var err = new Error(http.STATUS_CODES[code]);
    err.status = code;
    return err;
}

app.listen(port);
console.log("Serving " + root + " on port " + String(port) + "...");
