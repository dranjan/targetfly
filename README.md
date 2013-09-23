# Targetfly`

This is a very simple Node.js web application mainly intended as a
download server.  The only interesting feature is that it can serve
whole directories as TAR files that are generated on the fly.

## Installation

Install node.js and npm, then run `npm install` in the repository root.
You will also need some version of the `tar` command.  Both GNU tar and
BSD tar are believed to work, but targetfly may break with extremely old
versions of either.

## Usage

The simplest usage is

    node path/to/targetfly/index.js

which will serve files from the current working directory on port 8080.
The most complicated usage is

    node path/to/targetfly/index.js --port [PORT] \
                                    --directory [DIRECTORY] \
                                    --tar [PROGRAM] \
                                  [ --show-hidden ]

which chooses an arbitrary port, root directory, and tar binary.  The
last shown option, `--show-hidden`, will allow the server to serve files
whose names begin with '.', which is disabled by default.
