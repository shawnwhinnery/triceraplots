var style = document.createElement('style');

/*
	CSS will be repeated for each breakpoint
	----------------------------------------------------
*/
var breakpoints = {
	"wall" : "@media(min-width:1921px)",
	"wall-only" : "@media(min-width:1921px) and (min-device-width: 1921px)",
	"desk" : "@media(max-width:1920px)",
	"desk-only" : "@media(max-width:1920px) and (min-width:1368px)",
	"lap" : "@media(max-width:1367px)",
	"lap-only" : "@media(max-width:1367px) and (min-width:961px)",
	"hand" : "@media(max-width:960px)",
	"hand-only" : "@media(max-width:960px) and (max-device-width: 960px)",
}

var template = [
	'div{suffix}[class*=col-]{display:inline-block;vertical-align:top;float:left;box-sizing:border-box;}',
	'.row{suffix}{clear:both;position:relative;display:block}',
	'.row{suffix}:after{visibility:hidden;display:block;font-size:0;content:" ";clear:both;height:0;}',
	'.flex{suffix}{display:-webkit-flex;display:flex;flex-wrap:wrap}',
	'.flex{suffix}>div[class*=col-]{float:none;}',
	'.flex{suffix}>div[class*=col-auto]{width:auto;}',
	'.flex{suffix}.left{',
		'justify-content: flex-start;',
	'}',
	'.flex{suffix}.center{',
		'justify-content: center;',
	'}',
	'.flex{suffix}.right{',
		'justify-content: flex-end;',
	'}',
	'.flex{suffix}.top{',
		'align-items: flex-start;',
	'}',
	'.flex{suffix}.middle{',
		'align-items: center;',
	'}',
	'.flex{suffix}.bottom{',
		'align-items: flex-end;',
	'}',
	'.marg{suffix}{margin:3rem;}',
	'.pad{suffix}{padding:3rem;}'
];

// directional properties
var directions = ['n','s','e','w'];
var _directions = {n:'top', s:'bottom', e:'right', w:'left'};
for(var i = 0; i < directions.length; i++){
	template.push('.pad-'+directions[i]+'{suffix}{padding-'+_directions[directions[i]]+':3rem;}')
	template.push('.marg-'+directions[i]+'{suffix}{margin-'+_directions[directions[i]]+':3rem;}')
}

// auto col
for(var i = 2; i < 8; i++){
	template.push('.col-auto-'+i+'{suffix}{flex-grow:'+i+';}')
}
for(var i = 1; i < 16; i++){
	template.push('.sort-'+i+'{suffix}{order:'+i+';}')
}

// Grid columns
var columns = 12;
for(var numerator = 1; numerator < columns; numerator++){
	for(var denominator = 1; denominator < columns; denominator++){
		var width = (numerator / denominator) * 100;
		template.push('.col-'+numerator+'-'+denominator+'{suffix}{width:'+width+'%;}')
	}
}

template = template.join('\n');

var css = [];
css.push(template.replace(new RegExp('{suffix}', 'gi'), ''));
for(var breakpoint in breakpoints){
	var suffix = "-"+breakpoint;
	css.push(breakpoints[breakpoint]+"{");
	css.push('\n');
	css.push(template.replace(new RegExp('{suffix}', 'gi'), suffix));
	css.push('\n');
	css.push('}');
	css.push('\n');
	css.push('\n');
}
style.innerHTML += css.join('');

document.head.appendChild(style);