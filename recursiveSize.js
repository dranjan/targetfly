var async = require('async');
var fs = require('fs');
var path = require('path');

var debug = false;

function recursiveSize(pathname, filter, callback) {
    function logIt(fn, sz, nf, nd) {
        if (debug) {
            console.log(fn + " -> (" +
                        [sz, nf, nd].join(", ") +
                        ")");
        }
    }

    fs.stat(pathname, function (err, stats) {
        if (err) {
            callback(err);
        } else if (stats.isDirectory()) {
            var totalSize = 0;
            var totalNumFiles = 0;
            var totalNumDirectories = 1;

            function processFile(filename, cb) {
                filepath  = path.join(pathname, filename);

                if (!filter(pathname, filename)) {
                    cb();
                    return;
                }

                function accumulate(err, size, numFiles,
                                    numDirectories)
                {
                    if (err) {
                        cb(err);
                    } else {
                        totalSize += size;
                        totalNumFiles += numFiles;
                        totalNumDirectories += numDirectories;

                        cb();
                    }
                }

                recursiveSize(filepath, filter, accumulate);
            }

            fs.readdir(pathname, function (err, files) {
                if (err) {
                    callback(err);
                } else {
                    async.each(files, processFile, function (err) {
                        logIt(pathname,
                              totalSize, totalNumFiles, totalNumDirectories);
                        callback(err, totalSize, totalNumFiles,
                                 totalNumDirectories);
                    });
                }
            });
        } else {
            logIt(pathname, stats.size, 1, 0);
            callback(null, stats.size, 1, 0);
        }
    });
}

module.exports = recursiveSize;
