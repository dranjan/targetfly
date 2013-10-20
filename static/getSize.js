function getSize(pathname, callback) {
    $.ajax("/measure" + pathname, {
        dataType: "json",
        success: function (data, status) {
            callback(null, data.size, data.numFiles,
                     data.numDirectories);
        },
        error: function (jqXHR, textStatus, errorThrown) {
            callback(new Error(errorThrown));
        }
    });
}

function formatGetSize(size, numFiles, numDirectories) {
    return formatSize(size) + " (" + String(numFiles) +
        ((numFiles == 1)? " file, " : " files, ") + String(numDirectories) +
        ((numDirectories == 1)? " directory)" : " directories)");
}

$(document).ready(function () {
    $(".listing td.size.clickme").click(function (event) {
        var target = $(event.target);
        var pathname = target.children(".pathname").text();
        target.unbind("click");
        target.removeClass("clickme").addClass("waiting");
        target.text("(please wait...)");
        getSize(pathname, function (err, sz, nf, nd) {
            if (err) {
                target.removeClass("waiting").addClass("error");
                target.text("(error)");
            } else {
                target.removeClass("waiting").addClass("done");
                target.text(formatGetSize(sz, nf, nd));
            }
        });
    });
});
