var fstream = require('fstream');
var tar = require('tar');


/* monkey-patch workaround for fstream bug */
fstream.DirReader.prototype.getChildProps = function (stat) {
    return {
        depth: this.depth + 1,
        root: this.root || this,
        parent: this,
        follow: this.props.follow,
        filter: this.filter,
        sort: this.props.sort,
        hardlinks: this.props.hardlinks
    };
};

/* `filter' is a function to be called as filter(component) on each path
 * component that returns true if this component should be followed.
 * `error' is a function to be called in the event of error.
 */
function tarStream(dirpath, filter, error) {
    var reader = fstream.Reader({
        path: dirpath,
        type: 'Directory',
        follow: true,
        filter: function() {
            return filter(this.basename);
        }
    });

    var s = tar.Pack();

    reader.on('error', error);

    /* not sure if this is needed */
    s.on('error', error);

    reader.pipe(s);

    return s;
}

module.exports = tarStream;
