var fs = require('fs');
var path = require('path');

var program = require('commander');


var pkg = JSON.parse(fs.readFileSync(path.join(__dirname,
                                               "package.json")));
exports.version = pkg.version;

program.version(exports.version);
program.option('-p, --port [N]', 'port to listen on [8080]', 8080);
program.option('-d, --directory [PATH]',
               'directory to serve [.]', '.');
program.option('--show-hidden',
               'serve hidden files (affects TAR downloads as well)');
program.option('--show-backup',
               'serve backup files (#* and *~) ' +
               '(affects TAR downloads as well)');

program.parse(process.argv);

exports.port = program.port;
exports.root = program.directory;
exports.showHidden = program.showHidden;
exports.showBackup = program.showBackup;
