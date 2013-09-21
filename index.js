var express = require('express');
var fs = require('fs');
var spawn = require('child_process').spawn;
var jade = require('jade');
var program = require('commander');

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
    var pathname = request.url;
    var components = pathname.split('/');
    var valid = true;
    for (i in components) {
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
    var pathname = root + "/" + request.params[0];
    fs.stat(pathname, function (err, stats) {
        if (err) {
            error404(response);
        } else if (stats.isDirectory()) {
            var path = '/' + request.params[0];
            if (path[path.length-1] !== '/') path = path + '/';

            fs.readdir(pathname, function (err, files) {
                if (err) {
                    genericError(response, 500, err);
                } else {
                    response.render('directory', 
                                    {files: files, path: path});
                }
            });
        } else {
            /* The error handling here doesn't really work. */
            response.sendfile(pathname, {}, function (err) {
                if (err) {
                    genericError(response, 500, err);
                }
            });
        }
    });
});

app.get(/^\/download\/(.*)/, function(request, response) {
    var pathname = root + "/" + request.params[0];
    fs.stat(pathname, function (err, stats) {
        if (err) {
            error404(response);
        } else if (stats.isDirectory()) {
            downloadTar(pathname, response);
        } else {
            /* The error handling here doesn't really work. */
            response.download(pathname, basename(pathname),
                              function (err) {
                                  if (err) {
                                      genericError(response, 500, err);
                                  }
                              });
        }
    });
});

app.use(function (request, response) {
    error404(response);
});

function genericError(response, errorcode, err) {
    err.code = errorcode;
    response.status(errorcode).render('error', err);
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

function basename(path) {
    var components = path.split('/');
    return components[components.length - 1];
}

function dirname(path) {
    var components = path.split('/');
    components.pop();
    return components.length? components.join('/') : '.';
}

app.listen(port);
console.log("Serving " + root + " on port " + String(port) + "...");
