# Targetfly

This is a very simple Node.js web application mainly intended as a
download server.  The only interesting feature is that it can serve
whole directories as TAR files that are generated on the fly.

## Installation

Install node.js and npm, then run `npm install` in the repository root.

## Usage

The simplest usage is

    node path/to/targetfly/index.js

which will serve files from the current working directory on port 8080.
The most complicated usage is

    node path/to/targetfly/index.js --port [PORT] --directory [DIRECTORY]

which chooses an arbitrary port and root directory.
