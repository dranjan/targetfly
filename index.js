var express = require('express');
var fs = require('fs');
var spawn = require('child_process').spawn;
var jade = require('jade');
var program = require('commander');
var inspect = require('util').inspect;
var path = require('path');
var http = require('http');
var async = require('async');

var version = '0.0.2';

program.version(version);
program.option('-p, --port [N]', 'port to listen on [8080]', 8080);
program.option('-d, --directory [PATH]', 'directory to serve [.]', '.');
program.parse(process.argv);

var port = program.port;
var root = program.directory;

var app = express();

app.locals({
    version: version,
    platform: process.platform,
    arch: process.arch,
    node_version: process.version
})

app.use(express.logger('dev'));

app.set('views', __dirname + '/views');
app.engine('.jade', jade.renderFile);
app.set('view engine', 'jade');

/* This middleware will refuse to serve any paths with a component
 * beginning with '.', which prohibits hidden files (and by implication,
 * upward directory traversal).
 */
app.all('*', function (request, response, next) {
    var pathname = request.path;
    var components = pathname.split('/');
    var valid = true;

    for (var i in components) {
        if (components[i][0] === ".") {
            valid = false;
            error404(response);
        }
    }

    if (valid) next();
});

app.get('/', function (request, response) {
    response.redirect('/browse/');
});

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
                                    {files: files, path: dirpath});
                }
            });
        } else {
            /* The error handling here doesn't really work. */
            response.sendfile(pathname, {}, function (err) {
                if (err) genericError(response, err);
            });
        }
    });
});

app.get(/^\/download\/(.*)/, function(request, response) {
    var pathname = path.resolve(root, request.params[0]);
    fs.stat(pathname, function (err, stats) {
        if (err) {
            error404(response);
        } else if (stats.isDirectory()) {
            downloadTar(pathname, response);
        } else {
            /* The error handling here doesn't really work. */
            response.download(pathname, path.basename(pathname),
                              function (err) {
                                  if (err) genericError(response, err);
                              });
        }
    });
});

app.use(function (request, response) {
    error404(response);
});

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

/* callback is callback(err, files), where files is an array whose
 * entries are {name:filename, stat:{isdir:<boolean>}}.  The 'stat'
 * field can be null (if stat-ing the file failed).  The array contains
 * an entry for each non-hidden file in the top level of the given
 * directory.
 */
function dirInfo(dirpath, callback) {
    function fileInfo(filename, callback) {
        var tasks = {};
        var filepath = path.join(dirpath, filename);

        tasks.name = function (callback) {
            callback(null, filename);
        };

        tasks.stat = function (callback) {
            isDir(filepath, function (err, v) {
                if (err) {
                    callback(null, null);
                } else {
                    callback(null, {isdir: v});
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
                fn(path.basename(item)[0] !== '.');
            },
            function (files) {
                async.map(files, fileInfo, callback);
            });
        }
    });
}

/* callback is callback(err, <boolean>).  It will be called once with
 * the <boolean> representing whether the filename is a directory or
 * not.  err will be the error from fs.stat (if any).
 */
function isDir(filename, callback) {
    fs.stat(filename, function (err, stats) {
        if (err) {
            callback(err);
        }
        else {
            callback(null, stats.isDirectory());
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

function downloadTar(dirpath, response) {
    var cd = path.dirname(dirpath);
    var filename = path.basename(dirpath);
    var tarname = filename + ".tar";

    var child = spawn("tar", ["-c", "-C", cd, filename]);

    response.status(200);
    response.set({
        "Content-Type": "application/octet-stream",
        "Content-Disposition": "attachment; filename=" + tarname
    });

    child.stdout.pipe(response);
}

function httpError(code) {
    var err = new Error(http.STATUS_CODES[code]);
    err.status = code;
    return code;
}

app.listen(port);
console.log("Serving " + root + " on port " + String(port) + "...");
