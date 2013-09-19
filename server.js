var http = require('http');
var url = require('url');
var querystring = require('querystring');
var fs = require('fs');

function encode(query) {
    return JSON.stringify(query);
}

function start(route, port) {
    function onRequest(request, response) {
        var request_url = url.parse(request.url);
        var pathname = request_url.pathname;
        var query = querystring.parse(request_url.query);

        console.log("Request for " + pathname + " received.");

        route(pathname, query, response);
    }

    http.createServer(onRequest).listen(port);
    console.log("Listening on port " + String(port) + "...");
};

exports.start = start;
