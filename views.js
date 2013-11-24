var path = require('path');
var fs = require('fs');
var _ = require('underscore');


var static = path.join(__dirname, "static");

views = {};

_.each(['directory', 'error', '404'], function (viewname) {
    viewpath = path.join(__dirname, 'views', viewname + '.html_');
    views[viewname] = _.template(fs.readFileSync(viewpath,
                                                 {encoding:'utf8'}));
});

module.exports = views;
