/*

	crunch.worker.js
	----------------------------------------------------------------------------------------------------------------
	So all of the data manipulation has been consolidated into a single loop for performance reasons.
	Because of this there are a hand full of functions in here that I left in here strictly for reference.

*/
var _this = {};
var pixels_per_point = 1;

onmessage = function(e) {

    // Apply updates form the main thread
    for(var update in e.data){
        _this[update] = e.data[update]
    }
    

    if(!_this.raw_data){
        return postMessage({error:"raw data array is empty"})
    }

    var visual_data = [];

    // visual_data --------------------------------------------
    var results = process_data(_this);
    
    // This is used to consolidate data points on your screen
    results.aggregate_visual_by = aggregate_by(_this.plot_end, _this.plot_start, _this.width);


    // if the overlay data needs updating....
    if (_this.overlay_needs_update === true) {
        var overlay = create_overlay_data(_this.raw_data, Math.round(_this.width * .75));
        results.overlay_data = overlay.overlay_data;
        results.aggregate_overlay_by = overlay.aggregate_overlay_by;
    }

    // everything in the results object will be applied to the line chart constructor
    postMessage(results);
};

function nearestPow2(aSize) {
    return Math.pow(2, Math.round(Math.log(aSize) / Math.log(2)));
}

function aggregate_by(plot_end, plot_start, size) {
    var span = plot_end - plot_start;
    var division = Math.ceil(span / Math.round(size / pixels_per_point)); // So the goal is 2 pixels per point
    // var aggregate_by = (division < 1) ? 1 : nearestPow2(division); // You COULD use the value of division here. It results in more stepps with less aggressive aggregation HOWEVER I have found that using the nearset power of two results in more accurate decimation
    var aggregate_by = (division < 1) ? 1 : division;
    return aggregate_by;
}

function create_visual_aggregate(_this) {

    var visual_data = [];

    for (var i = 0; i < _this.raw_data.length; i++) {
        var _visual_data = aggregate_array_max(_this.raw_data[i], _this.aggregate_visual_by);
        visual_data.push(_visual_data);
    }

    return visual_data;
}

function process_data(_this) {

    // return these
    //var visual_data = [];
    var trimmed_visual_data = [];
    var raw_data_total = [];
    var plotted_data_total = [];
	var raw_data_average = [];
	var set_average = [];

    // lop through datasets
    for (var i = 0; i < _this.raw_data.length; i++) {

        //var tmp_visual_data = [];
        var tmp_trimmed_visual_data = [];
        var tmp_max = [];
		
        var dataset = _this.raw_data[i];
        var l = dataset.length;
        var counter = 1;
        var points_per = _this.aggregate_visual_by;

        raw_data_total[i] = 0;
        
        plotted_data_total[i] = 0;
        /*
            OPTIMIZE THIS LATER!
        */
        for (var d = 0; d < dataset.length; d++) {
        // for (var d = Math.floor(_this.plot_start / _this.aggregate_visual_by); d < dataset.length; d++) {
        // for (var d = _this.plot_start - _this.aggregate_visual_by; d < _this.plot_end + _this.aggregate_visual_by; d++) {

            tmp_max.push(dataset[d]);
            raw_data_total[i] += dataset[d];
            
            if (d >= _this.plot_start && d <= _this.plot_end) {
                plotted_data_total[i] += dataset[d];
            }

            if (counter === points_per) {
			
                var max = Math.max.apply(Math, tmp_max);

                if (d >= _this.plot_start && d <= _this.plot_end) {
                    tmp_trimmed_visual_data.push(max);
                }

                counter = 1;
                tmp_max = [];
            } else {
                counter++;
            }

        }

        // push datasets into return arrays
		raw_data_average[i] = raw_data_total[i] / l;
        //visual_data.push(tmp_visual_data);
        trimmed_visual_data.push(tmp_trimmed_visual_data);

    }

    return {
        //visual_data: visual_data,
        trimmed_visual_data: trimmed_visual_data,
        raw_data_total : raw_data_total,
        raw_data_average : raw_data_average,
        plotted_data_total : plotted_data_total,
    };
}

// Prep the visual data
function trim_raw_data(raw_data, start, end) {

    r = [];

    var l = raw_data.length;

    while (l--) {

        var data_set = raw_data[l];
        var tmp = [];

        for (var i = start; i < end; i++) {
            tmp.push(data_set[i]);
        }

        r.push(tmp);
    }

    return r;
}

function aggregate_array_average(arr, points_per) {

    var l = arr.length;
    var r = [];

    var counter = 1;
    var tmp_agg = 0;

    for (var i = 0; i < l; i++) {

        tmp_agg += arr[i];

        if (counter === points_per) {
            var avg = tmp_agg / points_per;
            r.push(avg);
            counter = 1;
            tmp_agg = 0;
        } else {
            counter++;
        }
    }

    return r;
}

function aggregate_array_max(arr, points_per) {
    var l = arr.length;
    var r = [];

    var counter = 1;
    var tmp_agg = [];
    var tmp_max = 0;

    for (var i = 0; i < l; i++) {

        tmp_agg.push(arr[i]);

        if (counter === points_per) {
            var max = Math.max.apply(Math, tmp_agg);
            r.push(max);
            counter = 1;
            tmp_agg = [];

        } else {
            counter++;
        }

    }

    delete tmp_agg;
    return r;
}

function array_skip(arr, skip) {
    var l = arr.length;
    var r = [];
    for (var i = 0; i < l; i += skip) {
        r.push(arr[i]);
    }
    return r;
}

function aggregate_array_sum(arr, points_per) {
    var l = arr.length;
    var r = [];
    var counter = 1;
    var tmp_agg = 0;

    for (var i = 0; i < l; i++) {
        tmp_agg += arr[i];
        if (counter === points_per) {
            r.push(tmp_agg);
            counter = 1;
            tmp_agg = 0;
        } else {
            counter++;
        }
    }

    return r;
}

function create_overlay_data(raw_data, width) {
    var aggregate_overlay_by = aggregate_by(raw_data[0].length, 0, width);
	
	
	
    var overlay_data = [];
    for (var i = 0; i < raw_data.length; i++) {
        var _visual_data = aggregate_array_max(raw_data[i], aggregate_overlay_by);
        overlay_data.push(_visual_data);
    }
	
    return {
        overlay_data: overlay_data,
        aggregate_overlay_by: aggregate_overlay_by
    };
}

function prep_after_visual_data(before_visual_data, cap) {

    var l = before_visual_data.length;
    var r = [];

    for (var i = 0; i < l; i++) {
        var data = before_visual_data[i];

        if (data > cap) {
            r.push(cap);
        } else {
            r.push(data);
        }
    }

    return r;
}