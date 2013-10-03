function formatSize(n) {
    function fmt(e, c) {
        var m = n/Math.pow(2, e);

        var precision = 0;
        if (m < 10) precision = 2;
        else if (m < 100) precision = 1;

        return m.toFixed(precision) + c;
    }

    if (n < Math.pow(2, 10)) {
        return String(n);
    } else if (n < Math.pow(2, 20)) {
        return fmt(10, "K");
    } else if (n < Math.pow(2, 30)) {
        return fmt(20, "M");
    } else if (n < Math.pow(2, 40)) {
        return fmt(30, "G");
    } else if (n < Math.pow(2, 50)) {
        return fmt(40, "T");
    } else {
        return fmt(50, "P");
    }
}

function formatDateFull(d, d0) {
    function formatYear(d, d0) {
        if (d.getFullYear() !== d0.getFullYear()) {
            return String(d.getFullYear()) + '&nbsp;';
        } else {
            return '';
        }
    }

    function formatMonth(d, d0) {
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        if (d.getFullYear() !== d0.getFullYear() ||
            d.getMonth() !== d0.getMonth() ||
            d.getDate() !== d0.getDate())
        {
            return months[d.getMonth()] + '&nbsp;';
        } else {
            return '';
        }
    }

    function formatDate(d, d0) {
        if (d.getFullYear() !== d0.getFullYear() ||
            d.getMonth() !== d0.getMonth() ||
            d.getDate() !== d0.getDate())
        {
            var s = String(d.getDate());
            if (s.length == 1) s = '&nbsp;' + s;
            return s + ',&nbsp;';
        } else {
            return '';
        }
    }

    function formatTime(d, d0) {
        return d.toTimeString();
    }

    return formatYear(d, d0) + formatMonth(d, d0) +
           formatDate(d, d0) + formatTime(d, d0);
}

if (exports) {
    exports.formatSize = formatSize;
    exports.formatDateFull = formatDateFull;
}
