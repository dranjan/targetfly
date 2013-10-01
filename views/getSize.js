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

$(document).ready(function () {
    $(".listing td[isDir='true'].size").click(function (event) {
        $(event.target).unbind("click");
        $(event.target).attr("status", "waiting");
        $(event.target).text("(please wait...)");
        getSize($(event.target).attr("pathname"), function (err, sz, nf, nd) {
            if (err) {
                $(event.target).attr("status", "error");
                $(event.target).text("(error)");
            } else {
                $(event.target).attr("status", "done");
                $(event.target).text(String(sz) +
                                     " (files: " + nf +
                                     ", directories: " + nd + ")");
            }
        });
    });
});
