var express = require('express');
var fs = require('fs');
var spawn = require('child_process').spawn;
var jade = require('jade');
var program = require('commander');
var inspect = require('util').inspect;
var path = require('path');
var http = require('http');

program.version('0.0.1');
program.option('-p, --port [N]', 'port to listen on [8080]', 8080);
program.option('-d, --directory [PATH]', 'directory to serve [.]', '.');
program.parse(process.argv);

var port = program.port;
var root = program.directory;

var app = express();

app.use(express.logger('dev'));

app.set('views', __dirname + '/views');
app.engine('.jade', jade.renderFile);
app.set('view engine', 'jade');

app.all('*', function (request, response, next) {
    var pathname = request.path;
    var components = pathname.split('/');
    var valid = true;

    /* Don't allow upward traversal in the request */
    for (var i in components) {
        if (components[i] === ".." || components[i] === ".") {
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

            fs.readdir(pathname, function (err, files) {
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
                if (err) {
                    genericError(response, err);
                }
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
                                  if (err) {
                                      genericError(response, err);
                                  }
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

function downloadTar(path, response) {
    var cd = dirname(path);
    var filename = basename(path);
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
