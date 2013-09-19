var fs = require('fs');
var util = require('util');
var spawn = require('child_process').spawn;

function route(pathname, query, response) {
    console.log("About to route a request for " + pathname);

    if (pathname[0] !== '/') {
        response.writeHead(400, {"Content-Type": "text/plain"});
        response.write("Malformed resource name: " + pathname);
        response.end();
    }

    pathname = "." + pathname;

    fs.stat(pathname, function (err, stats) {
        if (err) {
            response.writeHead(404, {"Content-Type": "text/plain"});
            response.write(err.name + ": " + err.message);
            response.end();
        } else if (stats.isDirectory()) {
            if (query['want'] == 'true') {
                downloadTar(pathname, response);
            } else {
                listDir(pathname, response);
            }
        } else {
            if (query['want'] === 'true') {
                showFile(pathname, response);
            } else {
                response.writeHead(200, {"Content-Type": "text/plain"});
                response.write(util.inspect(stats));
                response.end();
            }
        }
    });
}

function listDir(dirname, response, errcode) {
    if (!errcode) errcode = 500;

    fs.readdir(dirname, function (err, files) {
        if (err) {
            response.writeHead(errcode, {"Content-Type": "text/plain"});
            response.write(err.name + ": " + err.message);
            response.end();
        } else {
            response.writeHead(200, {"Content-Type": "text/plain"});
            response.write(files.join('\n'));
            response.end();
        }
    });
}


function downloadTar(path, response, errcode) {
    var child = spawn("tar", ["c", path]);

    var components = path.split('/');
    var tarname = components[components.length - 1] + ".tar";

    response.writeHead(
            200, 
            {
                "Content-Type": "application/octet-stream",
                "Content-Disposition": "attachment; filename=" + tarname
            });
    child.stdout.pipe(response);
}


function showFile(filename, response, errcode) {
    var reader = fs.createReadStream(filename);

    response.writeHead(200, {"Content-Type": "application/octet-stream"});
    reader.pipe(response);
}

exports.route = route;
