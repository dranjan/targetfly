var express = require('express');
var fs = require('fs');
var spawn = require('child_process').spawn;
var jade = require('jade')

var app = express();

app.use(express.logger('dev'));

app.set('views', __dirname + '/views');
app.engine('.jade', jade.renderFile);
app.set('view engine', 'jade');

app.get('/', function (request, response) {
    response.redirect('/browse/');
});

app.get(/^\/browse\/(.*)/, function (request, response) {
    var pathname = "./" + request.params[0];
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
    var pathname = "./" + request.params[0];
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

app.listen(8080);
