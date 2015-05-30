var Triceraplots = function(options) {
    var _this = this;

    /*
        
        -------------------------------------
    */
    this.stats = {
        draw: {
            drawing: false,
            calls: 0,
            fps: 0,
            last: Date.now()
        }
    };

    this.config = {
        debug: false,
        tooltips: {
            enabled: true,
            offset: [64, 0],
            snap: 'mouse',
            index: 0,
            date: 0,
            positions: [],
            format: []
        },
        container: options.container,
        resized: true,
        size: [
            options.container.getBoundingClientRect().width,
            options.container.getBoundingClientRect().height
        ],
        draw: {
            active_fps: (options.fps) ? options.fps : 60, // It will actually draw frames faster than your monitor can handle
            idle_fps: (options.idle_fps) ? options.idle_fps : 5,
            fps: (options.fps) ? options.fps : ((options.idle_fps) ? options.idle_fps : 5)
        },
        plot: {
            sort: false,
            styles: []
        },
        overlay: {
            enabled: true,
            needs_update: true
        },
        scrubber: {
            enabled: true,
            needs_update: true,
            size: [0, 64],
            position: [0, 64],
            handles: {
                size: [16, 32],
                style: {
                    lineWidth: 2,
                    strokeStyle: "rgba(100,100,100,.33)",
                    fillStyle: "#f5f5f5",
                }
            }
        },
        axes: {
            x: {
                enabled: true,
                needs_update: true,

                style: {
                    fillStyle: '#f5f5f5',
                    lineStyle: '#000000',
                    lineWidth: 1
                },
                font : {
                    font : "10px Arial, Helvetica, Sans",
                    fillStyle : "rgba(0,0,0,1)",
                },

                size: [0, 16]
            },
            y: {

                'left': {
                    enabled : true,
                    needs_update: true,
                    padding: [8, 8],
                    label_count: 5,
                    style: {
                        fillStyle: '#f5f5f5',
                        lineStyle: '#000000',
                        lineWidth: 1
                    },

                    font : {
                        font : "12px Arial, Helvetica, Sans",
                        fillStyle : "rgba(0,0,0,1)"
                    },

                    size: [32, 0],
                    align: 'right',
                    format: function(n) {
                        return n
                    }
                },

                'right': {
                    enabled : true,
                    needs_update: true,
                    padding: [8, 8],
                    label_count: 5,

                    style: {
                        fillStyle: '#f5f5f5',
                        lineStyle: '#000000',
                        lineWidth: 1
                    },

                    font : {
                        font : "12px Arial, Helvetica, Sans",
                        fillStyle : "rgba(0,0,0,1)"
                    },

                    size: [32, 0],

                    align: 'right',
                    format: function(n) {
                        return n
                    }
                }
            }
        },
        data: {
            needs_update: true
        }
    };

    // Axes from the options object
    if (options.axes) {

        // apply x axis options
        if (options.axes.x) {
            for (var prop in options.axes.x) {
                this.config.axes.x[prop] = options.axes.x[prop];
            }
        }

        // apply y axis options
        if (options.axes.y) {
            for (var side in options.axes.y) {
                console.log(side)
                for (var prop in options.axes.y[side]) {
                    this.config.axes.y[side][prop] = options.axes.y[side][prop];
                }
            }
        }

    }

    // tooltips
    if (options.tooltips) {
        for (var prop in options.tooltips) {
            this.config.tooltips[prop] = options.tooltips[prop]
        }
    }

    /*
        DATA
        -------------------------------------
    */
    this.dates = (options.dates) ? options.dates : []; // should be an array of integers with the exact length of the data provided
    this.raster_data = [];
    this.trimmed_visual_data = []; // draw this
    this.raw_data = []; // 100% of the data in all it's massive glory
    this.overlay_data = [];

    /*
        COMPUTE THREAD
        -------------------------------------
    */
    if (!options.worker) {
        if (options.crunch_file) {
            options.worker = options.crunch_file;
        } else {
            return console.warn("Missing option 'worker'.")
        }
    }
    this.worker = new Worker(options.worker);

    /*
        MOUSE
        -------------------------------------
        kind of a cluster jam.
    */
    this.mouse = {
        dragging: false,
        isdown: false,
        hovering: [], //array of... things(? lol) under the mouse cursor
        position: [], // [x,y]
        down: [], // [x,y]
        up: [], // [x,y]
        delta: [] // [x,y]
    };

    this.touch = {
        start: [],
        stop: [],
        delta: []
    };

    this.intent_to = {
        pan: false, // t || f
        pan_scrubber: false, // t || f
        resize_scrubber: 0 // -1 || 0 || 1
    };

    this.mousemove = function(e) {
        e.preventDefault();

        // UPDATE MOUSE POSITION
        var pos = getPosition(this);

        var event_x = (e.touches) ? e.touches[0].pageX : e.pageX;
        var event_y = (e.touches) ? e.touches[0].pageY : e.pageY;

        var scroll = getScroll();
        var scroll_x = scroll[0];
        var scroll_y = scroll[1];

        var relX = event_x - pos[0] - scroll_x;
        var relY = event_y - pos[1] - scroll_y;

        // UPDATE MOUSE MOVEMENT DELTA
        _this.mouse.delta = [
            _this.mouse.position[0] - relX,
            _this.mouse.position[1] - relY
        ];

        _this.mouse.position = [relX, relY];


        _this.mouse.scrubber_index = _this.x_to_absolute_index(_this.mouse.position[0]);


        _this.mouse.visual_index = Math.round(_this.mouse.position[0] / (_this.config.size[0] / (_this.plot_end - _this.plot_start)));
        _this.mouse.absolute_index = _this.plot_start + _this.mouse.visual_index;

        // update hover array
        _this.update_mouse_over();

        // Drag cap for PV shaving
        if (_this.mouse.dragging !== false) {
            if (typeof _this.mouse.dragging.ondrag === 'function') {
                _this.mouse.dragging.ondrag();
            }
        } else {
            if (_this.mouse.is_down === true) {


                if (_this.mouse.down[1] < (_this.config.size[1] - _this.config.scrubber.size[1])) {

                    // DRAGGING THE LINE CHART
                    // var new_start = (_this.plot_start + _this.mouse.delta[0] < 0) ? 0 : (_this.plot_start + _this.mouse.delta[0]);
                    // var new_end = (_this.plot_end - _this.mouse.delta[0] > (_this.raw_data[0].length - 1)) ? (_this.raw_data[0].length - 2) : (_this.plot_end + _this.mouse.delta[0]);

                    var new_start = _this.plot_start + _this.mouse.delta[0];
                    var new_end = _this.plot_end + _this.mouse.delta[0];


                    // lock plot start @ 0th index
                    if (new_start < 0) {
                        return;
                    }

                    // lock plot_end @ last index
                    if (new_end > _this.raw_data[0].length - 1) {
                        return
                    }

                    _this.plot_start = new_start;
                    _this.plot_end = new_end;

                } else {

                    // DRAGGING THE SCRUBBER
                    var offset = _this.mouse.range * .5;
                    var center = _this.x_to_absolute_index(_this.mouse.position[0]);

                    var new_start = (center - offset < 0) ? 0 : (center - offset) >> 0;
                    var new_end = (center + offset > (_this.raw_data[0].length - 1)) ? _this.raw_data[0].length - 1 : (center + offset) >> 0;

                    if ((new_end - new_start) < _this.mouse.range) {
                        return;
                    }

                    _this.plot_start = new_start;
                    _this.plot_end = new_end;

                }

            }
        }
    };

    this.touchmove = function(e) {
        e.preventDefault();

        // UPDATE MOUSE POSITION
        var pos = getPosition(this);

        var scroll = getScroll();
        var scroll_x = scroll[0];
        var scroll_y = scroll[1];

        var event_x = (e.touches) ? e.touches[0].pageX : e.pageX;
        var event_y = (e.touches) ? e.touches[0].pageY : e.pageY;

        var relX = event_x - pos[0] - scroll_x;
        var relY = event_y - pos[1] - scroll_y;

        // UPDATE MOUSE MOVEMENT DELTA
        _this.mouse.delta = [
            _this.mouse.position[0] - relX,
            _this.mouse.position[1] - relY
        ];

        _this.mouse.position = [relX, relY];

        if (_this.mouse.dragging !== false) {
            if (typeof _this.mouse.dragging.ondrag === 'function') {
                _this.mouse.dragging.ondrag();
            }
        }
    };

    this.mouseup = function(e) {
        _this.mouse.is_down = false;

        var scroll = getScroll();
        var scroll_x = scroll[0];
        var scroll_y = scroll[1];

        var pos = getPosition(this);
        var relX = e.pageX - pos[0] - scroll_x;
        var relY = e.pageY - pos[1] - scroll_y;

        _this.mouse.dragging = false;
        _this.mouse.up = [relX, relY];
    };

    this.touchend = function(e) {
        var pos = getPosition(this);

        var event_x = (e.touches) ? e.touches[0].pageX : e.pageX;
        var event_y = (e.touches) ? e.touches[0].pageY : e.pageY;

        var scroll = getScroll();
        var scroll_x = scroll[0];
        var scroll_y = scroll[1];

        var relX = event_x - pos[0] - scroll_x;
        var relY = event_y - pos[1] - scroll_y;

        _this.mouse.hovering = [];
        _this.mouse.dragging = false;
        _this.mouse.up = [relX, relY];
    };

    this.mousedown = function(e) {
        e.preventDefault();
        _this.mouse.is_down = true;
        var pos = getPosition(this);

        var event_x = (e.touches) ? e.touches[0].pageX : e.pageX || e.clientX;
        var event_y = (e.touches) ? e.touches[0].pageY : e.pageY || e.clientY;

        var scroll = getScroll();
        var scroll_x = scroll[0];
        var scroll_y = scroll[1];

        var relX = event_x - pos[0] - scroll_x;
        var relY = event_y - pos[1] - scroll_y;

        _this.mouse.down = [relX, relY];
        _this.mouse.range = _this.plot_end - _this.plot_start;

        if (_this.mouse.hovering.length > 0) {
            _this.mouse.dragging = _this.mouse.hovering[0];
        }
    };

    this.touchstart = function(e) {

        // e.preventDefault();

        // UPDATE MOUSE POSITION
        var pos = getPosition(this);

        var event_x = (e.touches) ? e.touches[0].pageX : e.pageX;
        var event_y = (e.touches) ? e.touches[0].pageY : e.pageY;

        var scroll = getScroll();
        var scroll_x = scroll[0];
        var scroll_y = scroll[1];

        var relX = event_x - pos[1] - scroll_x;
        var relY = event_y - pos[0] - scroll_y;

        _this.mouse.position = _this.touch.start = [relX, relY];

        _this.mouse.hovering = [];
        _this.mouse.dragging = false;

        _this.update_mouse_over();

        if (_this.mouse.hovering.length > 0) {
            _this.mouse.dragging = _this.mouse.hovering[0];
        }
    };



    /*
        HTML ELEMENTS
        -------------------------------------
    */
    this.canvases = []; // HTML canvas elements
    this.contexts = []; // canvas 2D contexts

    /*
        MISC
        -------------------------------------
    */
    this.peak_y = 0; // highest peak in the series
    this.aggregate_visual_by = 512; // initial value is set high to spare memory during init. This number is updated almost instantly though.
    this.plot_start = 0; // visual plpot index start
    this.plot_end = 0; // visual plpot index stop

    /*SHOULD BE MOVED TO THE CONFIG*/
    this.buttons = {
        left_handle: {
            x: 0,
            y: 0,
            r: 12,
            fill_color: 'rgba(75,75,75,.75)',
            onmouseover: function() {},
            onmouseout: function() {},
            ondrag: function() {
                var index = _this.x_to_absolute_index(_this.mouse.position[0]);
                if ((index + 16) <= _this.plot_end) {
                    _this.plot_start = index;
                } else {
                    _this.plot_start = _this.plot_end - 16;
                }
            }
        },
        right_handle: {
            x: 0,
            y: 0,
            r: 12,
            fill_color: 'rgba(75,75,75,.75)',
            onmouseover: function() {},
            onmouseout: function() {},
            ondrag: function() {
                var index = _this.x_to_absolute_index(_this.mouse.position[0]);
                if ((index - 16) >= _this.plot_start) {
                    _this.plot_end = index;
                } else {
                    _this.plot_end = _this.plot_start + 16;
                }
            }
        }
    };
    /*SHOULD BE MOVED TO THE CONFIG*/


    /*
        METHODS
        -------------------------------------
    */


    /*
        I use get_style to so that if a style does not exist I can generate one first. Keep it DRY!

    */
    this.update_dates = function(dates) {
        _this.dates = dates;
    }

    var types = ['fill', 'line', 'wave'];
    var specialCtxts = ['bg', 'overlay'];

    this.get_style = function(i) {

        if (typeof _this.config.plot.styles[i] !== 'object') {

            var r = Math.round(80 + (175 * Math.random()));
            var g = Math.round(80 + (175 * Math.random()));
            var b = Math.round(80 + (175 * Math.random()));
            var a = .5;

            _this.config.plot.styles[i] = {
                type: 'fill',
                lineWidth: 3,
                strokeStyle: "rgba(" + r + "," + g + "," + b + "," + a + ")",
                fillStyle: "rgba(" + r + "," + g + "," + b + "," + a + ")",
                color: "rgba(" + r + "," + g + "," + b + "," + a + ")"
            };
        }

        return _this.config.plot.styles[i]
    }

    this.set_style = function(i, props) {

        // if the first argument is a drawing context we don't need to look it up
        if (typeof i === 'object') {
            if (typeof i.fillStyle != undefined) {
                for (var p in props) {
                    i[p] = props[p];
                }
            }
            return
        }

        if (typeof _this.config.plot.styles[i] !== 'object') {
            _this.get_style(i)
            return _this.set_style(i, props)
        }

        for (var p in props) {
            _this.config.plot.styles[i][p] = props[p];
        }

    }

    this.prep_data = function() {

        var message = {
            plot_start: _this.plot_start,
            plot_end: _this.plot_end,
            aggregate_visual_by: _this.aggregate_visual_by
        };

        if (this.config.resized === true) {
            message.width = _this.config.size[0];
            this.config.resized = false;
        }

        // raw data needs update
        if (_this.config.data.needs_update === true) {
            message.raw_data = _this.raw_data;
            _this.config.data.needs_update = false;
        }

        // overlay update?
        if (_this.config.overlay.needs_update === true) {
            message.overlay_needs_update = true;
            _this.config.overlay.needs_update = false;
        }

        // post to worker
        _this.worker.postMessage(message);

        // debug?
        if (_this.config.debug === true) {
            console.groupCollapsed('%c prep_data', 'color:green');
            for (var msg in message) {
                console.log(message[msg])
            }
            console.groupEnd();
        }
    };

    this.worker.onmessage = function(e) {

        if (e.data.error) {
            console.warn(e.data.error)
        }


        if (_this.config.debug === true) {
            console.groupCollapsed('%c onmessage', 'color:orange');
            for (var d in e.data) {
                console.groupCollapsed(d);
                console.log(e.data[d])
                console.groupEnd();
            }
            console.groupEnd();
        }

        for (var d in e.data) {
            _this[d] = e.data[d];
        }

        if (_this.stats.draw.drawing === false) {
            _this.draw();
            _this.stats.draw.drawing = true;
        }
        _this.prep_data();
    };

    /*
        Data treatment / retrieval
    */
    this.load_csv = function(data_position) {
        var xmlhttp = new XMLHttpRequest();
        xmlhttp.open("GET", data_position, false);
        xmlhttp.send();
        _this.consume_csv(xmlhttp.responseText);
    };

    this.consume_csv = function(string, resetZoom) {

        // replace line breaks with commas
        string = string.replace(/(?:\r\n|\r|\n)/g, ',');

        // convert aray of strings to an array of integers
        var temp = new Array();
        temp = string.split(",");

        for (a in temp) {
            var watts = parseFloat(temp[a]);

            if (typeof watts === 'number') {
                this.before_total += watts;
                temp[a] = watts;
            }
        }

        this.raw_data.push(temp);
        if (resetZoom !== false) {
            this.plot_end = temp.length - 1;
        }


        if (this.trimmed_visual_data.length === options.data.length) {
            this.cap_y = this.update_peak_y();
            // this.prep_data();

            if (typeof options.ready === 'function') {
                options.ready.call(this);

            }

            this.config.axes.x.needs_update = true;
            this.config.overlay.needs_update = true;
        }
    };

    this.consume_array = function(arr, resetZoom) {

        this.raw_data.push(arr);

        if (resetZoom !== false) {
            this.plot_end = arr.length - 1;
        }
        if (this.trimmed_visual_data.length === options.data.length) {
            this.cap_y = this.update_peak_y();
            // this.prep_data();

            if (typeof options.ready === 'function') {
                options.ready.call(this);

            }
            this.config.axes.x.needs_update = true;
            this.config.overlay.needs_update = true;
        }
    }

    this.update_peak_y = function() {
        var peak = 0;
        var low = 0;
        for (var i = 0; i < this.trimmed_visual_data.length; i++) {
            var data_set = this.raw_data[i];
            for (var d = 0; d < data_set.length; d++) {
                peak = (data_set[d] > peak) ? data_set[d] : peak;
                low = (data_set[d] < low) ? data_set[d] : low;
            }
        }
        peak = peak + (peak * .05); // 5% vertical padding at the top
        this.peak_y = peak;
        this.low_y = low;
        return peak;
    };

    // CLEAR CANVASES  -----------------------------
    this.clear_canvases = function() {
        var l = this.canvases.length;
        while (l--) {
            this.clear_canvas(l);
        }
    };

    this.clear_canvas = function(i) {
        _this.contexts[i].clearRect(0, 0, _this.config.size[0], _this.config.size[1]);
    };

    // DRAW VISUAL DATA TO SCREEN ------------------
    this.plot_all = function() {

        if (_this.contexts.length !== _this.trimmed_visual_data.length) {
            _this.create_elements();
            // _this.resize();
            return _this.plot_all();
        }

        var l = _this.contexts.length;
        while (l--) {
            _this.plot_data(l);
        }

        if (_this.config.plot.sort === true) {
            _this.update_z_index();
        }
    };

    var count = 0;
    this.style_ctx = function(ctx, style) {
        for (var prop in style) {
            ctx[prop] = style[prop];
        }
    }

    this.plot_data = function(i) {

        if (!_this.trimmed_visual_data[i]){
            return;
        }

        var visual_data = _this.trimmed_visual_data[i];
        var ctx = _this.contexts[i];
        var l = visual_data.length;
        var start = _this.convert_vector([0, visual_data[0]], l);

        // clear right before plotting
        _this.clear_canvas(i);

        ctx.beginPath();
        ctx.moveTo(start[0], (_this.config.size[1] - _this.config.scrubber.size[1] - _this.config.axes.x.size[1])); // Start at bottom left corner
        ctx.lineTo(start[0], start[1]); // Go straight up to the first point

        var style = _this.get_style(i);
        _this.style_ctx(ctx, style);


        if (style.type === 'curve') {

            ctx.beginPath();
            start = _this.convert_vector([-.5, visual_data[0]], l);
            ctx.moveTo(start[0], (_this.config.size[1] - _this.config.scrubber.size[1] - _this.config.axes.x.size[1])); // Start at bottom left corner
            ctx.lineTo(start[0], start[1]); // Go straight up to the first point

            for (var _i = 1; _i < l; _i++) {

                var height = visual_data[_i];
                var nextHeight = (visual_data[_i + 1])? visual_data[_i + 1] : visual_data[_i];
                var avg_height = (nextHeight + height) / 2;

                var end = _this.convert_vector([_i + .5,avg_height]);
                var control = _this.convert_vector([_i, height], l);

                ctx. quadraticCurveTo(control[0], control[1], end[0], end[1]);
            }

            var end = this.convert_vector([l, 0], l);
            ctx.lineTo(end[0], end[1]);
            ctx.closePath();
            ctx.fill();
            return;
        }

        if (style.type === 'fill') {

            for (var _i = 0; _i < l; _i++) {
                var height = visual_data[_i];
                var end_point = _this.convert_vector([_i, height], l);
                ctx.lineTo(end_point[0], end_point[1]);
            }

            var end = this.convert_vector([l, 0], l);
            ctx.lineTo(end[0], end[1]);
            ctx.closePath();
            ctx.fill();
            return;
        }

        if (style.type === 'line') {
            ctx.beginPath();
            ctx.lineWidth = (style.lineWidth) ? style.lineWidth : 1;
            ctx.lineCap = "round";
            var m = _this.convert_vector([0, visual_data[0]], l);
            ctx.moveTo(-10, m[1]);
            // lop through data
            for (var _i = 0; _i < l; _i++) {
                // PLOT LINE
                var line_to = _this.convert_vector([_i, visual_data[_i]], l);

                ctx.lineTo(line_to[0], line_to[1]);
            }

            var end = this.convert_vector([l, 0], l);
            ctx.lineTo(end[0], end[1]);

            // ctx.strokeStyle = style.color;
            ctx.stroke();
            return;

        } else {

            var y = _this.config.size[1] - this.config.scrubber.size[1] - this.config.axes.x.size[1];

            // lop through data
            ctx.lineWidth = (Math.round(_this.config.size[0] / _this.trimmed_visual_data[0].length) * .5) - (i * 16);

            for (var _i = 0; _i < l; _i++) {
                // PLOT LINE
                var vec2 = _this.convert_vector([_i, visual_data[_i]], l);
                vec2[0] -= .5;
                ctx.moveTo(vec2[0], y);
                ctx.lineTo(vec2[0], vec2[1]);
            }

            //ctx.lineWidth = 1;
            ctx.stroke();

        }
    };

    // UI EVENTS 
    this.add_events = function() {

        options.container.addEventListener('mouseenter', function() {
            console.log("updating fps")
            _this.config.draw.fps = _this.config.draw.active_fps
        });
        options.container.addEventListener('mouseleave', function() {
            console.log("updating fps")
            _this.config.draw.fps = _this.config.draw.idle_fps
        });

        options.container.addEventListener('mousedown', _this.mousedown);
        options.container.addEventListener('touchstart', _this.touchstart);

        options.container.addEventListener('mouseup', _this.mouseup);
        window.addEventListener('mouseup', _this.mouseup);

        options.container.addEventListener('touchend', _this.touchend);
        window.addEventListener('touchend', _this.touchend);

        options.container.addEventListener('mousemove', _this.mousemove);
        options.container.addEventListener('touchmove', _this.touchmove);

        window.addEventListener('resize', _this.resize);
    };

    this.resize = function(e) {

        _this.config.size = [
            _this.config.container.getBoundingClientRect().width,
            _this.config.container.getBoundingClientRect().height
        ];

        _this.config.resized = true;

        var l = _this.canvases.length;
        var ratio = window.devicePixelRatio || 1;

        while (l--) {

            _this.canvases[l].width = _this.config.size[0] * ratio;
            _this.canvases[l].height = _this.config.size[1] * ratio;
            _this.canvases[l].style.width = _this.config.size[0] + "px";
            _this.canvases[l].style.height = _this.config.size[1] + "px";
            _this.contexts[l].scale(ratio, ratio);

        }

        _this.config.scrubber.position[1] = _this.config.size[1] - _this.config.scrubber.size[1];
        _this.config.scrubber.position[0] = 0;
        _this.config.scrubber.size[0] = _this.config.size[0];

        // scale overlay canvas
        _this.overlay_canvas.width = _this.config.size[0] * ratio;
        _this.overlay_canvas.height = _this.config.size[1] * ratio;
        _this.overlay_canvas.style.width = _this.config.size[0] + "px";
        _this.overlay_canvas.style.height = _this.config.size[1] + "px";
        _this.overlay_ctx.scale(ratio, ratio);

        // scale bg canvas
        _this.bg_canvas.width = _this.config.size[0] * ratio;
        _this.bg_canvas.height = _this.config.size[1] * ratio;
        _this.bg_canvas.style.width = _this.config.size[0] + "px";
        _this.bg_canvas.style.height = _this.config.size[1] + "px";
        _this.bg_ctx.scale(ratio, ratio);

        // scale raster canvas
        _this.raster_canvas.width = _this.config.size[0] * ratio;
        _this.raster_canvas.height = _this.config.size[1] * ratio;
        _this.raster_canvas.style.width = _this.config.size[0] + "px";
        _this.raster_canvas.style.height = _this.config.size[1] + "px";
        _this.raster_ctx.scale(ratio, ratio);

        _this.config.overlay.needs_update = true;
    };

    this.update_mouse_over = function() {

        _this.mouse.hovering = [];

        var button_size = _this.config.scrubber.handles.size;

        for (var button_name in _this.buttons) {

            var button = _this.buttons[button_name];
            var button_start_x = button.x;
            var button_end_x = button.x + button_size[0];
            var button_start_y = button.y;
            var button_end_y = button.y + button_size[1];

            // BB collision
            if (
                _this.mouse.position[0] > button_start_x &&
                _this.mouse.position[0] < button_end_x &&
                _this.mouse.position[1] > button_start_y &&
                _this.mouse.position[1] < button_end_y
            ) {
                _this.mouse.hovering.push(button);
                if (typeof button.onmouseover === 'function') {
                    button.onmouseover();
                }
            } else {
                if (typeof button.onmouseout === 'function') {
                    button.onmouseout();
                }
            }

        }

        _this.update_intent();
    };

    this.update_intent = function() {
        if (_this.mouse.hovering.length !== 0) {

            if (_this.mouse.is_down === true) {
                options.container.style.cursor = '-webkit-grabbing';
            } else {
                options.container.style.cursor = '-webkit-grab';
            }

        } else {

            if (_this.mouse.position[1] < (_this.config.size[1] - _this.config.scrubber.size[1])) {

                if (_this.mouse.is_down === true) {
                    options.container.style.cursor = '-webkit-grabbing';
                } else {
                    options.container.style.cursor = '-webkit-grab';
                }
                _this.intent_to.pan = true;
                _this.intent_to.resize_scrubber = 0;
                _this.intent_to.pan_scrubber = false;

            } else {
                var index = _this.mouse.scrubber_index;
                _this.intent_to.pan = false;

                if (index > _this.plot_start && index < _this.plot_end) {
                    options.container.style.cursor = '-webkit-grab';
                    _this.intent_to.pan_scrubber = true;
                    _this.intent_to.resize_scrubber = 0;
                }


            }
        }
    };

    this.draw_overlay = function() {

        this.overlay_ctx.clearRect(0, 0, _this.config.size[0], _this.config.size[1]);


        if (
            _this.config.overlay.enabled !== true || !_this.overlay_data || _this.overlay_data.length === 0
        ) {
            return;
        }

        /*
            Draw overlay elements
        */
        this.draw_scrubber_line();
        this.draw_scrubber_handles();
        this.generate_date_labels();
        this.draw_y_axes();
    };

    /*
        Returns the height of the main drawing area
    */
    this.calc_plot_height = function() {
        return _this.config.size[1] - _this.config.scrubber.size[1] - _this.config.axes.x.size[1];
    }


    /*This is some wonky ish. Been changing it a lot so it's pretty sloppy.*/
    this.draw_y_axes = function() {


        var line_start = 4;
        var line_end = _this.config.size[0] - 4;

        if (this.config.axes.y['left'].enabled)
            line_start += 12
        if (this.config.axes.y['right'].enabled)
            line_end -= 12

        var y_space = this.calc_plot_height();
        var points = 8;
        var step = Math.round(y_space / points);

        _this.overlay_ctx.beginPath()
        _this.overlay_ctx.strokeStyle = "rgba(0,0,0,.2)";

        // stroke lines
        for (var point = 1; point < points; point++) {
            var y = y_space - (step * point) - .5;
            _this.overlay_ctx.moveTo(line_start, y)
            _this.overlay_ctx.lineTo(line_end, y)
        }

        _this.overlay_ctx.stroke()

        // write labels
        for (var point = 1; point < points; point++) {
            
            var value = _this.y_to_val(y);
            var y = y_space - (step * point) - 4.5;

            if (this.config.axes.y['left'].enabled){
                _this.set_style(_this.overlay_ctx, this.config.axes.y['left'].font)
                _this.overlay_ctx.fillText(this.config.axes.y['left'].format(value),line_start,y)
            }

            if (this.config.axes.y['right'].enabled){
                _this.set_style(_this.overlay_ctx, this.config.axes.y['right'].font)
                var text = this.config.axes.y['right'].format(value);
                var x = line_end - _this.overlay_ctx.measureText(text).width;
                _this.overlay_ctx.fillText(text,x,y)
            }

        }

    }
    this.draw_y_axis = function(axis) {

        if (!axis.enabled) {
            return
        }

        var ctx = this.overlay_ctx;
        var bg_ctx = this.bg_ctx;

        // get value of the top of the chart
        var y_space = this.calc_plot_height();

        var points = Math.round(y_space / 5);
        var gap = y_space / points;

        var bottom = 0;

        // set up dat font
        ctx.font = axis.font_size + " " + axis.font_family;
        ctx.fillStyle = axis.color;

        bg_ctx.beginPath();

        // find out how wide the axis is going to need to be
        var widest_label = 0;
        for (var i = 0; i <= points; i++) {
            var y = gap * i;
            var line_y = y;
            var val = _this.y_to_val(y);
            var text = axis.format(val);
            var width = ctx.measureText(text).width;
            if (width > widest_label) {
                widest_label = ctx.measureText(text).width
            }
        }


        var line_x;
        if (axis.align === "right") {
            line_x = 0;
            line_width = label_x
        } else {
            line_x = widest_label + (axis.padding[0] * 2);
        }

        var label_x = _this.config.size[0] - (widest_label + axis.padding[0]);
        ctx.fillStyle = "rgba(255,255,255,.1)";
        // ctx.fillRect(label_x - (axis.padding[0] * .5), 0,100,_this.calc_plot_height())

        ctx.moveTo(label_x - (axis.padding[0] * .5), 0)
        ctx.lineTo(label_x - (axis.padding[0] * .5), _this.calc_plot_height())
        ctx.strokeStyle = 'rgba(0,0,0,.05)';
        ctx.stroke()



        for (var i = 1; i < points; i++) {

            var y = gap * i;
            var line_y = y;
            var val = _this.y_to_val(y);
            var text = axis.format(val);
            var line_x;
            // var label_x = 0;
            var line_width = _this.config.size[0];

            if (i === 0) {
                y += (parseInt(axis.font_size) * .75);
                line_y += (parseInt(axis.font_size) * .75);
            }

            if (i === points) {
                y -= (parseInt(axis.font_size) * .75);
                line_y -= (parseInt(axis.font_size) * .75);
                continue
            }

            y += parseInt(axis.font_size) * .5;

            if (i === gap) {
                y -= (parseInt(axis.font_size) * .5);
            }

            // fill text ---------------------------------------------------------------------------------------
            ctx.fillStyle = "rgba(0,0,0,.8)";
            ctx.fillText(
                text,
                label_x,
                y);

            // stroke line ----------------------------------------------------------------------------------
            bg_ctx.lineWidth = 1;
            line_y = Math.round(line_y) - .5;
            if (i !== 0 && i !== points) {
                bg_ctx.moveTo(line_x, line_y);
                bg_ctx.lineTo(line_width, line_y);
            }

        }
        this.bg_ctx.strokeStyle = 'rgba(40,40,40,.25)';
        bg_ctx.stroke();
    };

    this.draw_scrubber_line = function() {
        var ctx = this.overlay_ctx;
        ctx.fillStyle = "rgba(0,0,0,.1)";

        // plot mini line -----------------------------------------------
        for (var i = 0; i < this.overlay_data.length; i++) {
            ctx.beginPath();
            var style = _this.get_style(i);
            ctx.strokeStyle = (style.type === 'fill') ? style.fillStyle : style.strokeStyle;
            var visual_data_set = this.overlay_data[i];
            var l = visual_data_set.length;

            var start = this.convert_scrubber_vector([0, visual_data_set[0]], l);
            ctx.moveTo(start[0], start[1]);

            for (var d = 0; d < l; d++) {
                var data = visual_data_set[d];
                var pos = this.convert_scrubber_vector([d, data], l);
                ctx.lineTo(pos[0], pos[1]);
            }

            ctx.stroke();
        }
    };

    this.draw_scrubber_handles = function() {

        if (_this.plot_start < 0) {
            _this.plot_start = 0;
        }

        var ctx = _this.overlay_ctx;
        var y_space = _this.calc_plot_height();
        ctx.save();
        _this.style_ctx(ctx, _this.config.scrubber.handles.style);

        // draw handles ----------------------------------------------
        var start_progress = this.plot_start / this.raw_data[0].length;
        var end_progress = this.plot_end / this.raw_data[0].length;

        var start_x = Math.round(this.overlay_data[0].length * start_progress);
        var end_x = Math.round(this.overlay_data[0].length * end_progress);

        var l = this.overlay_data[0].length;

        ctx.beginPath();

        // scrubber line start
        var start = this.convert_scrubber_vector([start_x, 0]);

        // scrubber line end
        var end = this.convert_scrubber_vector([end_x, 0]);



        // grey out sections of the mini line that arent being plotted
        var left_block_width = start[0];
        var right_block_width = _this.config.size[0] - end[0];
        var thickness = (_this.config.size[1] - _this.config.scrubber.size[1]);

        ctx.fillStyle = 'rgba(0,0,0,.2)';
        ctx.strokeStyle = 'rgba(0,0,0,.2)';
        ctx.lineWidth = 1;

        ctx.moveTo(
            start[0] + .5,
            _this.config.size[1] - _this.config.scrubber.size[1]
        )

        ctx.lineTo(
            start[0] + .5,
            _this.config.size[1]
        )

        ctx.moveTo(
            start[0] + .5,
            _this.config.size[1] - _this.config.scrubber.size[1] + .5
        )


        ctx.lineTo(
            start[0] + .5 - 10000,
            _this.config.size[1] - _this.config.scrubber.size[1] + .5
        )



        ctx.moveTo(
            end[0] - .5,
            _this.config.size[1] - _this.config.scrubber.size[1]
        )

        ctx.lineTo(
            end[0] - .5,
            _this.config.size[1]
        )

        ctx.moveTo(
            end[0] - .5,
            _this.config.size[1] - _this.config.scrubber.size[1] + .5
        )

        ctx.lineTo(
            end[0] - .5 + 10000,
            _this.config.size[1] - _this.config.scrubber.size[1] + .5
        )

        ctx.stroke();
        ctx.fillRect(
            0,
            _this.config.size[1] - _this.config.scrubber.size[1] + .5,
            start[0],
            _this.config.scrubber.size[1]
        );

        ctx.fillRect(
            end[0],
            _this.config.size[1] - _this.config.scrubber.size[1] + .5,
            _this.config.size[0],
            _this.config.scrubber.size[1]
        );

        ctx.beginPath();

        // update scrubber handle positions
        var base = thickness + (_this.config.scrubber.size[1] * .5);
        var left_handle_y = base + (_this.buttons.left_handle.r * .5);
        var right_handle_y = base + (_this.buttons.right_handle.r * .5);
        var button_size = _this.config.scrubber.handles.size;

        this.buttons.left_handle.x = start[0] - (button_size[0] * .5);
        this.buttons.left_handle.y = (_this.config.size[1] - _this.config.scrubber.size[1]) + ((_this.config.scrubber.size[1] * .5) - (button_size[1] * .5)) + 3;

        this.buttons.right_handle.x = end[0] - _this.config.scrubber.handles.size[0] + (button_size[0] * .5);
        this.buttons.right_handle.y = this.buttons.left_handle.y;

        for (var button_name in _this.buttons) {

            var button = this.buttons[button_name];
            _this.style_ctx(ctx, _this.config.scrubber.handles.style);

            if (
                _this.mouse.position[0] > button.x && _this.mouse.position[0] < button.x + button_size[0] && _this.mouse.position[1] > button.y && _this.mouse.position[1] < button.y + button_size[1]
            ) {
                _this.config.container.style.cursor = 'ew-resize'
                ctx.fillStyle = 'rgba(255,255,255,1)';
                ctx.strokeStyle = '#02b8ff';
            }

            ctx.beginPath();

            var size = _this.config.scrubber.handles.size;
            var button_x = button.x;
            var button_y = button.y;

            ctx.shadowColor = 'rgba(0,0,0,.43)';
            ctx.shadowBlur = 20;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;


            ctx.strokeRect(button_x, button_y, size[0], size[1])
            ctx.fillRect(button_x, button_y, size[0], size[1])


        }


        // done
        ctx.restore();
    };

    this.label_format = '#MM#/#DD#/#YYYY#';
    this.label_width = null;
    this.config.axes.x.needs_update = true;


    /*
        Dynamic date labels
    */
    var label_formats = [
        "#MM#/#DD# #hh#:#mm#",
        "#MMM# #DD##th# #hh#:#mm##ampm#",
        "#MMM# #DD##th#",
        "#MMM# #YYYY#",
        "#YYYY#"
    ]

    var split_by = [
        function(n) {
            return new Date(n).getMinutes()
        },
        function(n) {
            return new Date(n).getHours()
        },
        function(n) {
            return new Date(n).getDate()
        },
        function(n) {
            return new Date(n).getMonth()
        },
        function(n) {
            return new Date(n).getFullYear()
        }
    ];

    this.generate_date_labels = function() {

        this.bg_ctx.clearRect(0, 0, _this.config.size[0], _this.config.size[1]); // Always clear
        if (!_this.trimmed_visual_data) {
            return;
        }

        var ctx = _this.bg_ctx;
        var l = _this.plot_end - _this.plot_start;
        var span = _this.dates[_this.plot_end] - _this.dates[_this.plot_start]; // time span being plotted right now
        var pppx = _this.config.size[0] / l; // pixels per point
        var ppms = span / l; // milliseconds per point
        var msppx = span / _this.config.size[0]; // milliseconds per pixel
        var y = _this.calc_plot_height();

        /* How wide a label WOULD be if it were drawn to the canvas */
        var breaks = [
            Math.ceil(60000 / msppx),
            Math.ceil(3600000 / msppx),
            Math.ceil(86400000 / msppx),
            Math.ceil(2678400000 / msppx),
            Math.ceil(31536000000 / msppx)
        ];

        _this.set_style(this.overlay_ctx, this.config.axes.x.style)

        // background of the overlay ctx
        _this.overlay_ctx.fillRect(0, y, _this.config.size[0], _this.config.axes.x.size[1]);

        for (var b = 0; b < breaks.length; b++) {
            if (breaks[b] > 100) {

                var previous = split_by[b](_this.dates[_this.plot_start]);

                for (var i = _this.plot_start; i < _this.plot_end; i++) {

                    var current = split_by[b](_this.dates[i]);

                    if (current != previous) {

                        var x = Math.round(pppx * (i - _this.plot_start)) + .5;

                        var offset = _this.config.axes.x.size[1] * .5;
                        offset += Math.round(parseInt(_this.overlay_ctx.font) * .5);

                        var text = new Date(_this.dates[i]).customFormat(label_formats[b]);

                        _this.set_style(_this.overlay_ctx,  _this.config.axes.x.font)
                        _this.overlay_ctx.fillText(text, x, y + offset)

                        _this.strokeStyle = "rgba(0,0,0,.25)";
                        ctx.beginPath();
                        ctx.moveTo(x, y)
                        ctx.lineTo(x, 0)
                        ctx.stroke();

                        previous = current

                    }
                }
                return;
            }
        }

        return;
    };

    this.convert_vector = function(vec2) {

        var padding = 0;

        var y_space = _this.calc_plot_height();

        var x = padding + Math.round((((_this.config.size[0] - padding * 2)) / (_this.trimmed_visual_data[0].length - 1)) * vec2[0]);
        var y = Math.round(y_space - ((y_space / _this.peak_y) * vec2[1]));


        if (y > y_space) {
            y = y_space
        }

        return [x, y];
    };

    this.convert_scrubber_vector = function(vec2) {
        var padding = _this.config.scrubber.handles.size[0];
        var x = padding + (Math.round(((_this.config.scrubber.size[0] - padding * 2) / (_this.overlay_data[0].length - 1)) * vec2[0]));
        var y = this.config.scrubber.size[1] - ((this.config.scrubber.size[1] / _this.peak_y) * vec2[1]) + (_this.config.size[1] - this.config.scrubber.size[1]);
        return [x, y];
    };

    this.y_to_val = function(y) {
        var height = _this.config.size[1] - _this.config.scrubber.size[1] - _this.config.axes.x.size[1];
        var r = _this.peak_y - ((y / height) * _this.peak_y);
        return r;
    };

    this.x_to_absolute_index = function(x) {
        var px_val = _this.raw_data[0].length / _this.config.size[0];
        return Math.round(x * px_val) >> 0;
    };

    this.x_to_visual_index = function(x) {
        if (!_this.trimmed_visual_data) {
            return 0
        }
        var pixels_per_point = _this.config.size[0] / (_this.plot_end - _this.plot_start);
        var x_points = Math.round(x / pixels_per_point);
        var index = _this.plot_start + x_points;
        return index;
    };

    this.position_tooltips = function() {

        if (_this.config.tooltips.index !== _this.mouse.visual_index) {

            var range = _this.plot_end - _this.plot_start;
            var pos = _this.mouse.absolute_index - _this.plot_start;
            var progress = pos / range;
            if(progress >= .5){
                if(TweenLite){
                    TweenLite.to(_this.config.tooltips.offset, .5, [-120,0])
                }else{
                    _this.config.tooltips.offset[0] = -120;
                }
            }else{                
                if(TweenLite){
                    TweenLite.to(_this.config.tooltips.offset, .5, [120,0])
                }else{
                    _this.config.tooltips.offset[0] = 120;
                }
            }

            _this.config.tooltips.index = _this.mouse.visual_index;

            if (typeof TweenLite === 'function') {
                TweenLite.to(_this.config.tooltips, .2, {
                    date: _this.dates[_this.mouse.absolute_index],
                });
            } else {
                _this.config.tooltips.date = _this.dates[_this.mouse.absolute_index]
            }


            for (var i = 0; i < _this.trimmed_visual_data.length; i++) {

                var pos = _this.convert_vector(
                    [
                        _this.config.tooltips.index,
                        _this.raw_data[i][_this.mouse.absolute_index]
                    ]
                );

                pos[2] = _this.dates[i][_this.mouse.absolute_index];

                if (typeof TweenLite === 'function')
                    TweenLite.to(_this.config.tooltips.positions[i], .2, pos);
                else
                    _this.config.tooltips.positions[i] = pos
            }
        }
    }

    this.draw_tooltips = function() {

        if (
            (_this.mouse.position[1] > (_this.config.size[1] - _this.config.scrubber.size[1])) || (_this.config.size[0] / (_this.plot_end - _this.plot_start)) < 6 || _this.mouse.is_down === true
        ) {
            return;
        }

        _this.position_tooltips();
        var ctx = _this.overlay_ctx;
        ctx.save();
        var chart_middle = (_this.config.size[1] - _this.config.scrubber.size[1]) * .5;
        var spindex = _this.mouse.visual_index;
        var point_position = this.convert_vector([spindex, 0])[0];

        var text_style = {
            fillColor: "rgba(0,0,0,1)",
            font: "14px Arial, Helvetica, Sans",
        }

        var label_height = 20;

        var box_size = [
            100,
            label_height * _this.trimmed_visual_data.length
        ];

        // center the box
        var box_x = _this.config.tooltips.positions[0][0] - (box_size[0] * .5)
        // apploy offset
        var box_position = [
            box_x + _this.config.tooltips.offset[0],
            chart_middle - (box_size[1] * .5)
        ];

        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "rgba(0,0,0,.8)";
        ctx.lineWidth = 1;

        /*teh ehf?*/
        ctx.strokeRect(box_position[0], box_position[1], box_size[0], box_size[1])
        ctx.fillRect(box_position[0], box_position[1], box_size[0], box_size[1])
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillText(
            new Date(_this.config.tooltips.date).customFormat(_this.label_format),
            box_position[0],
            box_position[1] - 8
        )

        for (var i = 0; i < _this.config.tooltips.positions.length; i++) {

            var position = _this.config.tooltips.positions[i];
            var text_y = box_position[1] + (label_height * i) + 15;
            ctx.beginPath();
            _this.style_ctx(ctx, _this.get_style(i))
            ctx.strokeStyle = "rgba(0,0,0,.25)";
            ctx.lineWidth = 2;
            ctx.fillStyle = (_this.config.plot.styles[i].type === 'fill') ? _this.config.plot.styles[i].fillStyle : _this.config.plot.styles[i].strokeStyle;
            ctx.strokeRect(position[0] - 5, position[1] - 5, 10, 10)
            ctx.strokeRect(position[0] - 5, position[1] - 5, 10, 10)
            ctx.strokeRect(position[0] - 5, position[1] - 5, 10, 10)

            ctx.fillRect(position[0] - 5, position[1] - 5, 10, 10)
            ctx.fillRect(position[0] - 5, position[1] - 5, 10, 10)
            ctx.fillRect(position[0] - 5, position[1] - 5, 10, 10)


            ctx.font = "14px Arial, Helvetica, sans";
            ctx.strokeStyle = (_this.config.plot.styles[i].type === 'fill') ? _this.config.plot.styles[i].fillStyle : _this.config.plot.styles[i].strokeStyle;
            ctx.fillStyle = "rgba(0,0,0,1)";

            ctx.lineWidth = 4;
            ctx.moveTo(box_position[0] + ctx.lineWidth * .5, text_y - 15)
            ctx.lineTo(box_position[0] + ctx.lineWidth * .5, text_y + 5)
            ctx.stroke()

            ctx.strokeStyle = "rgba(255,255,255,1)";
            var formatter = (_this.config.tooltips.format[i]) ? _this.config.tooltips.format[i] : function(n){return n};
            ctx.fillText(
                formatter(_this.raw_data[i][_this.mouse.absolute_index]),
                box_position[0] + 6 + ctx.lineWidth,
                text_y
            )

        }

        ctx.restore();
    }


    this.draw = function() {
        var s = Date.now();
        _this.plot_all();
        _this.draw_overlay();

        if (_this.config.tooltips.enabled) {
            _this.draw_tooltips();
        }

        _this.stats.draw.last = Date.now();
        _this.stats.draw.calls++;

        if (typeof options.onupdate === 'function') {
            options.onupdate.bind(_this)()
        }

        window.requestAnimationFrame(function() {

            var timeout = 1000 / _this.config.draw.fps;
            var min_timeout = timeout;

            var delta = Date.now() - _this.stats.draw.last;
            timeout = Math.round(timeout - delta);
            timeout = (timeout < min_timeout) ? min_timeout : timeout;

            _this.stats.draw.fps = Math.round(1000 / timeout);

            window.setTimeout(function() {
                _this.draw();
            }, timeout);

        });
    };

    this.zoom_to_date_range = function(start, end) {

        var offset = new Date('1/1/2009'); // use this date because I know DST is not in effect
        offset = (offset.getTimezoneOffset()) * 60000; // millesecond difference between UTC and local time

        offset = 0;

        start = new Date(start);
        end = new Date(end);

        start = new Date(start.getTime() + offset);

        end = new Date(end.getTime() + offset);

        var start_index = 0;
        var end_index = 0;

        var l = _this.dates.length;

        for (var i = 0; i < l; i++) {

            var _date = new Date(_this.dates[i] + offset);

            if (_date <= start) {
                start_index = i;
            }

            if (_date >= end) {
                end_index = i;
                break; // end the loop
            }
        }
        if (typeof TweenLite === 'function') {

            var plot = {
                start: _this.plot_start,
                end: _this.plot_end
            };
            // _this.fps = 60;
            TweenLite.to(plot, 1, {
                start: start_index,
                end: end_index,
                onUpdate: function() {
                    _this.plot_start = plot.start >> 0;
                    _this.plot_end = plot.end >> 0;
                },
                onComplete: function() {
                    window.setTimeout(function() {
                        // _this.fps = 4;
                    }, 250)

                }
            });
        } else {
            _this.plot_start = start_index;
            _this.plot_end = end_index;
        }
    };

    // looks at the average value of the visual data and adjusts the z index of each plot so the tallest plots are in back and the shortest are in front
    this.update_z_index = function() {

        var averages = [];
        var _averages = {};

        // populate averages array
        for (var set = 0; set < this.trimmed_visual_data.length; set++) {
            var dataset = this.trimmed_visual_data[set];
            var visual_total = 0;
            for (var point = 0; point < dataset.length; point++) {
                visual_total += dataset[point];
            }

            averages.push([set, (visual_total / dataset.length)]);
        }

        averages.sort(function(a, b) {
            return a[1] - b[1]
        })

        // apply sorted array to canvas z-index

        for (var i = 0; i < averages.length; i++) {
            var sort = averages[i];
            var canvas = this.canvases[sort[0]];
            var z_index = 2 + (averages.length - i);
            canvas.style.zIndex = z_index;
        }
    };

    // CREATE AND STYLE THE DOM NODES USED IN THE INTERFACE
    this.create_elements = function() {

        // clear the container
        options.container.innerHTML = "";
        _this.canvases = [];
        _this.contexts = [];

        this.raster_canvas = document.createElement('canvas');
        this.raster_canvas.id = "raster_canvas";
        this.raster_canvas.style.position = "absolute";
        this.raster_canvas.style.top = "0px";
        this.raster_canvas.style.left = "0px";
        this.raster_canvas.style.zIndex = "2";

        this.raster_ctx = this.raster_canvas.getContext('2d');
        _this.config.container.appendChild(this.raster_canvas);

        // create canvas elements
        for (var i = 0; i < this.trimmed_visual_data.length; i++) {
            _this.canvases.push(document.createElement('canvas'));
            var canvas = this.canvases[i];
            canvas.id = "data_index_" + i;
            options.container.appendChild(canvas);
            canvas.style.position = "absolute";
            canvas.style.zIndex = i + 5;
            canvas.style.top = canvas.style.left = "0px";
            this.contexts.push(canvas.getContext("2d"));
            this.clear_canvas(i);
        }

        this.overlay_canvas = document.createElement('canvas');
        this.overlay_canvas.style.position = "absolute";
        this.overlay_canvas.style.pointerEvents = "none";
        this.overlay_canvas.className = "overlay_canvas";
        this.overlay_canvas.style.top = this.overlay_canvas.style.left = "0px";
        this.overlay_canvas.style.zIndex = 100;
        options.container.appendChild(this.overlay_canvas);
        this.overlay_ctx = this.overlay_canvas.getContext("2d");

        this.bg_canvas = document.createElement('canvas');
        this.bg_canvas.style.position = "absolute";
        this.bg_canvas.style.pointerEvents = "none";
        this.bg_canvas.className = "bg_canvas";
        this.bg_canvas.style.top = this.bg_canvas.style.left = "0px";
        this.bg_canvas.style.zIndex = 1;
        options.container.appendChild(this.bg_canvas);
        this.bg_ctx = this.bg_canvas.getContext("2d");

        var l = this.canvases.length;
        while (l--) {
            var ratio = window.devicePixelRatio || 1;
            this.canvases[l].height = _this.config.size[1] * ratio;
            this.canvases[l].width = _this.config.size[0] * ratio;
        }
    };

    this.update_data = function(data, resetZoom) {
        if (resetZoom !== false) {
            this.plot_start = 0;
            this.plot_end = 0;
        }

        _this.config.axes.x.needs_update = true;
        _this.config.data.needs_update = false;

        _this.raw_data = [];
        _this.trimmed_visual_data = [];
        _this.config.tooltips.positions = [];
        for (var i = 0; i < data.length; i++) {

            _this.config.tooltips.positions.push([0, 0, 0])
            _this.trimmed_visual_data[i] = []
            if (typeof data[i] === 'string') {
                var comma_count = (data[i].split(",").length - 1);
                if (comma_count > 1) {
                    // is csv
                    this.consume_csv(data[i], resetZoom);
                    return;
                } else {
                    // is resource position
                    //this.load_csv(data[i]);
                }
            } else {
                this.consume_array(data[i], resetZoom);
            }
        }

        _this.update_peak_y();
        _this.config.overlay.needs_update = true;
        _this.config.data.needs_update = true;
    }

    this.init = function() {
        _this.update_data(options.data, true);

        // normalize request animation frame
        window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

        // Custom date format
        if (!Date.customFormat) {
            Date.prototype.customFormat = function(formatString) {
                try {
                    var YYYY, YY, MMMM, MMM, MM, M, DDDD, DDD, DD, D, hhh, hh, h, mm, m, ss, s, ampm, AMPM, dMod, th;
                    var dateObject = this;
                    YY = ((YYYY = dateObject.getFullYear()) + "").slice(-2);
                    MM = (M = dateObject.getMonth() + 1) < 10 ? ('0' + M) : M;
                    MMM = (MMMM = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][M - 1]).substring(0, 3);
                    DD = (D = dateObject.getDate()) < 10 ? ('0' + D) : D;
                    DDD = (DDDD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dateObject.getDay()]).substring(0, 3);
                    th = (D >= 10 && D <= 20) ? 'th' : ((dMod = D % 10) == 1) ? 'st' : (dMod == 2) ? 'nd' : (dMod == 3) ? 'rd' : 'th';
                    formatString = formatString.replace("#YYYY#", YYYY).replace("#YY#", YY).replace("#MMMM#", MMMM).replace("#MMM#", MMM).replace("#MM#", MM).replace("#M#", M).replace("#DDDD#", DDDD).replace("#DDD#", DDD).replace("#DD#", DD).replace("#D#", D).replace("#th#", th);

                    h = (hhh = dateObject.getHours());
                    if (h == 0)
                        h = 24;
                    if (h > 12)
                        h -= 12;
                    hh = h < 10 ? ('0' + h) : h;
                    AMPM = (ampm = hhh < 12 ? 'am' : 'pm').toUpperCase();
                    mm = (m = dateObject.getMinutes()) < 10 ? ('0' + m) : m;
                    ss = (s = dateObject.getSeconds()) < 10 ? ('0' + s) : s;
                    return formatString.replace("#hhh#", hhh).replace("#hh#", hh).replace("#h#", h).replace("#mm#", mm).replace("#m#", m).replace("#ss#", ss).replace("#s#", s).replace("#ampm#", ampm).replace("#AMPM#", AMPM);
                } catch (err) {
                    return 0;
                }
            };
        }

        this.create_elements();
        this.label_width = this.overlay_ctx.measureText('xxxxxxxxxxxxx').width;
        this.add_events();

        if (options.container.style.position == '') {
            options.container.style.position = 'relative';
        }

        // Javascript media q
        if (window.matchMedia) {
            var is_phone = window.matchMedia("(min-device-width : 320px) and (max-device-width : 768px)");
            var is_tablet = window.matchMedia("(min-device-width : 769px) and (max-device-width : 1024px)");
            if (is_phone.matches === true) {
                _this.buttons.left_handle.r = _this.buttons.right_handle.r = 35;
            } else if (is_tablet.matches === true) {
                _this.buttons.left_handle.r = _this.buttons.right_handle.r = 20;
            }
        }

        // run resize once for good measure
        _this.resize();
        _this.prep_data();
    };

    this.init();
};


function getPosition(element) {
    if (!element) {
        return [0, 0]
    }
    // I have no fucking idea why this is necessary but...
    // occasionally getBoundingClientRect is undefined
    if (!element.getBoundingClientRect) {
        return [0, 0]
    }
    // client rect is more accurate. Firefox didn't like the above method.
    var rect = element.getBoundingClientRect();
    return [rect.left, rect.top];
}

// function localize_date(date) {
//     return new Date(date.getFullYear(), date.getMonth(), date.getDay(), date.getHours(), date.getMinutes(), date.getSeconds());
// }

Date.prototype.customFormat = function(formatString) {
    try {
        var YYYY, YY, MMMM, MMM, MM, M, DDDD, DDD, DD, D, hhh, hh, h, mm, m, ss, s, ampm, AMPM, dMod, th;
        var dateObject = this;
        YY = ((YYYY = dateObject.getFullYear()) + "").slice(-2);
        MM = (M = dateObject.getMonth() + 1) < 10 ? ('0' + M) : M;
        MMM = (MMMM = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][M - 1]).substring(0, 3);
        DD = (D = dateObject.getDate()) < 10 ? ('0' + D) : D;
        DDD = (DDDD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dateObject.getDay()]).substring(0, 3);
        th = (D >= 10 && D <= 20) ? 'th' : ((dMod = D % 10) == 1) ? 'st' : (dMod == 2) ? 'nd' : (dMod == 3) ? 'rd' : 'th';
        formatString = formatString.replace("#YYYY#", YYYY).replace("#YY#", YY).replace("#MMMM#", MMMM).replace("#MMM#", MMM).replace("#MM#", MM).replace("#M#", M).replace("#DDDD#", DDDD).replace("#DDD#", DDD).replace("#DD#", DD).replace("#D#", D).replace("#th#", th);

        h = (hhh = dateObject.getHours());
        if (h == 0)
            h = 24;
        if (h > 12)
            h -= 12;
        hh = h < 10 ? ('0' + h) : h;
        AMPM = (ampm = hhh < 12 ? 'am' : 'pm').toUpperCase();
        mm = (m = dateObject.getMinutes()) < 10 ? ('0' + m) : m;
        ss = (s = dateObject.getSeconds()) < 10 ? ('0' + s) : s;
        return formatString.replace("#hhh#", hhh).replace("#hh#", hh).replace("#h#", h).replace("#mm#", mm).replace("#m#", m).replace("#ss#", ss).replace("#s#", s).replace("#ampm#", ampm).replace("#AMPM#", AMPM);
    } catch (err) {
        return err;
    }
};

/* MAY NOT WORK ON FF FOR LINUX AND MAC*/
function getScroll() {
    var r = [0, 0];

    if (typeof pageYOffset != 'undefined') {
        //most browsers except IE before #9
        r[1] = pageYOffset;
        r[0] = pageXOffset;
    } else {
        var B = document.body; //IE 'quirks'
        var D = document.documentElement; //IE with doctype
        D = (D.clientHeight) ? D : B;
        r[1] = D.scrollTop;
        r[0] = D.scrollLeft;
    }
    return r;
}

function isNumber(n) {
    return n === parseFloat(n);
}

function isEven(n) {
    return isNumber(n) && (n % 2 == 0);
}