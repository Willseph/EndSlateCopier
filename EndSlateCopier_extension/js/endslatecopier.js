/* * *
* EndSlateCopier
* Written by William Thomas
* Licenced under the MIT License:
* 
* The MIT License (MIT)
* Copyright (c) 2016 William Thomas
* 
* Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
* 
* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
* 
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
* * */

var findVideoPattern = /span\s+class=\\"video-time\\".{5,30}\\u003e([0-9:]+)\\u003c\\\/span.{20,400}\s+href=\\"\\\/watch\?v=([^\\]+)\\"\s*class=\\"vm-video-title-content yt-uix-sessionlink\\"\s+data-sessionlink=\\"[a-z0-9=_-]+\\"\s*\\u003e\s*(.{1,100})\s*\\u003c\\\/a\\u003/ig;
var findAuthTokenPattern = /"auth_token":"([^"]+)"/ig;
var existingVideos = [];
var existingVideoDict = {};
var $endslatecopyContent;
var currentVideoID;
var chosenVideo;
var $endslatecopyVideoOptions;
var chosenVideoAnnotations;
var $endslatecopyAnnotationLengthInput;
var chosenAnnotationLength;
var authToken;
var finalAnnotationPackageXML;
var videoLength = 0;
var $endslatecopyVideoSelectedButton;
var $endslatecopyAnnotationLengthSetButton;
var endSlateAnnotationElements = [];
var endSlateTimeBuffer = 5;

function endslatecopy_Main() {
	jQuery('#video-info').first().append('<div style="clear:both;"></div>');
	jQuery('#video-info').first().append(endslatecopy_BuildCopyStuff());
	
	currentVideoID = /youtu\.be\/(.+)$/i.exec(jQuery('.video-url-input-field').val())[1];
	var durationString = jQuery('dd').filter(function(i,$e){return $e.innerHTML.match(/^\d+:\d+(:\d+)?$/);}).first().text();
	videoLength = endslatecopy_TimeStringToSeconds(durationString);
	
	if(videoLength<2) {
		$endslatecopyContent.html("Could not find this video's duration, or the duration is too short.");
		return;
	}
	
	endslatecopy_FetchVideos();
}

function endslatecopy_BuildCopyStuff() {
	var $endslatecopyMainBlock = jQuery('<div></div>').attr('id','endslatecopy-copy');
	
	$endslatecopyMainBlock.append('<div class="head">Copy Endslate Annotations</div>');
	
	$endslatecopyContent = jQuery('<div id="endslatecopy-content"></div>');
	$endslatecopyContent.append(endslatecopy_CreateLoading('Loading videos'));
	$endslatecopyMainBlock.append($endslatecopyContent);
	
	return $endslatecopyMainBlock;
}

function endslatecopy_CreateButton(text) {
	var $b = jQuery('<button class="yt-uix-button yt-uix-button-size-default yt-uix-tooltip yt-uix-button-primary" type="button"><span class="yt-uix-button-content">'+text+'</span></button>');
	return $b;
}

function endslatecopy_CreateLoading(text) {
	var imgSrc= chrome.extension.getURL('img/ajax.gif');
	var $l = jQuery('<div id="endslatecopy-copy-loading"><img src="'+imgSrc+'"/><span class="txt">'+text+'</span></div>');
	return $l;
}

function endslatecopy_FormatTime(d) {
	d = Number(d);
	var h = Math.floor(d / 3600);
	var m = Math.floor(d % 3600 / 60);
	var s = Math.floor(d % 3600 % 60);
	return ((h > 0 ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (s < 10 ? "0" : "") + s);
}

function endslatecopy_TimeStringToSeconds(durationString) {
	var splitDuration = durationString.split(':');
	
	var result = parseInt(splitDuration[splitDuration.length-1]);
	if(splitDuration.length>=2) 
		result += 60*parseInt(splitDuration[splitDuration.length-2]);
	if(splitDuration.length>=3) 
		result += 60*60*parseInt(splitDuration[splitDuration.length-3]);
	
	return result;
}

function endslatecopy_GenerateFinalXMLPackage() {
	var startAnnotateTimeStr = endslatecopy_FormatTime(videoLength-chosenAnnotationLength)+'.000';
	var endAnnotateTimeStr = endslatecopy_FormatTime(videoLength)+'.000';
	
	for(var i=0; i<endSlateAnnotationElements.length; i++) {
		var el = endSlateAnnotationElements[i];
		
		if(el.getAttribute('type')=='highlight') {
			var timeTags = el.childNodes[1].childNodes[1].getElementsByTagName('rectRegion');
			var startTimeTag = timeTags[0];
			var endTimeTag = timeTags[1];
			
			startTimeTag.setAttribute('t',startAnnotateTimeStr);
			endTimeTag.setAttribute('t',endAnnotateTimeStr);
		}
	}
	
	var xmlResult = '<document><requestHeader video_id="'+currentVideoID+'"/><authenticationHeader video_id="'+currentVideoID+'" auth_token="'+authToken+'"/><updatedItems>';
	
	for(var i=0; i<endSlateAnnotationElements.length; i++) {
		var el = endSlateAnnotationElements[i];
		xmlResult = xmlResult+(new XMLSerializer()).serializeToString(el);
	}
	
	xmlResult = xmlResult+'</updatedItems></document>';
	return xmlResult;
}

function endslatecopy_AnnotationUpdateSuccess() {
	$endslatecopyContent.html('The annotations were successfully copied! Check the annotations tab to be sure and to finalize the changes.');
}

function endslatecopy_AnnotationUpdateFail(req,status,error){
	$endslatecopyContent.html('<div class="endslatecopy-error">An error occurred while writing the annotations. Please try again or file an issue on the GitHub repo if it persists.</div>');
}

function endslatecopy_MakeAnnotationUpdate(xml) {
	jQuery.ajax({
		url:'https://www.youtube.com/annotations_auth/update2',
	    data:xml,
	    method:'post',
	    success:function(data) {
	    	endslatecopy_AnnotationUpdateSuccess();
	    },
	    error:function(req,status,error){
		    endslatecopy_AnnotationUpdateFail(req,status,error);
	    }
	});
}

function endslatecopy_gotAuthToken() {
	finalAnnotationPackageXML = endslatecopy_GenerateFinalXMLPackage().replace(/\n/g, "")
	    .replace(/\s+\</g, "<")
	    .replace(/\>\s+\</g, "><")
	    .replace(/\>\s+$/g, ">")
	    .trim();
	    
	endslatecopy_MakeAnnotationUpdate(finalAnnotationPackageXML);
}

function endslatecopy_AnnotationLengthSet() {
	chosenAnnotationLength = parseInt($endslatecopyAnnotationLengthInput.val());
	$endslatecopyContent.empty();
	$endslatecopyContent.append(endslatecopy_CreateLoading('Applying annotations'));
	
	jQuery.get("https://www.youtube.com/my_videos_annotate?v=" + chosenVideo.id, function(e) {
		var m = findAuthTokenPattern.exec(e);
		authToken = m[1];
		endslatecopy_gotAuthToken();
	});
}

function endslatecopy_ValidFloat(s) {
	return !/^\s*$/.test(s) && !isNaN(s);
}

function endslatecopy_NoEndSlateAnnotationsFound() {
	$endslatecopyContent.html('No end slate annotations found in the chosen video. Please refresh and try again.');
}

function endslatecopy_FindEndSlateAnnotations() {
	if(!chosenVideoAnnotations) {
		endslatecopy_NoEndSlateAnnotationsFound();
		return;
	}
	
	// First pass of annotations
	var dependentAnnotations = [];
	var annotationElements = chosenVideoAnnotations.getElementsByTagName('annotation');
	var endSlateAnnotationHighlightIDs = {};
	
	for(var i=0; i<annotationElements.length; i++) {
		var el = annotationElements[i];
		var isDependent = el.firstElementChild.hasAttribute('spaceRelative');
		
		if(!el.hasAttribute('id') || !el.getAttribute('id').match(/^annotation_/))
			continue;
		
		if(el.getAttribute('type')=='highlight') {
			var timeTags = el.childNodes[1].childNodes[1].getElementsByTagName('rectRegion');
			var endTimeTag = timeTags[1];
			
			var annotationOrigEndingTime = endslatecopy_TimeStringToSeconds(endTimeTag.getAttribute('t'));
			if(chosenVideo.length - annotationOrigEndingTime > endSlateTimeBuffer)
				continue;
				
			endSlateAnnotationHighlightIDs[el.getAttribute('id')]=true;
		}
		else if(isDependent) 
			dependentAnnotations.push(el);
		
		el.removeAttribute('log_data');
		if(!el.hasAttribute('author'))
			el.setAttribute('author','');
		
		if(!isDependent)
			endSlateAnnotationElements.push(el);
	}
	
	// Second pass, going over dependent annotations
	for(var i=0; i<dependentAnnotations.length; i++) {
		var el = dependentAnnotations[i];
		var dependency = el.firstElementChild.getAttribute('spaceRelative');
		if(dependency in endSlateAnnotationHighlightIDs)
			endSlateAnnotationElements.push(el);
	}
}

function endslatecopy_GotAnnotations() {
	endslatecopy_FindEndSlateAnnotations();
	if(endSlateAnnotationElements.length < 1) {
		endslatecopy_NoEndSlateAnnotationsFound();
		return;
	}
	
	$endslatecopyAnnotationLengthInput = jQuery('<input type="text" class="yt-uix-form-input-text endslatecopy-float-l" placeholder="Annotation length (sec)"></input>');
	$endslatecopyAnnotationLengthInput.keyup(function() {
		var v = jQuery(this).val();
		if(!endslatecopy_ValidFloat(v)) {
			$endslatecopyAnnotationLengthSetButton.attr('disabled','disabled');
			return;
		}
		
		var n = parseFloat(v);
		if(n <= 0.5) {
			$endslatecopyAnnotationLengthSetButton.attr('disabled','disabled');
			return;
		}
		
		$endslatecopyAnnotationLengthSetButton.removeAttr('disabled');
	});
	
	$endslatecopyContent.empty();

	$endslatecopyContent.append($endslatecopyAnnotationLengthInput);
	
	$endslatecopyAnnotationLengthSetButton = endslatecopy_CreateButton('Copy!');
	$endslatecopyAnnotationLengthSetButton.addClass('endslatecopy-float-r');
	$endslatecopyAnnotationLengthSetButton.attr('disabled','disabled');
	$endslatecopyAnnotationLengthSetButton.click(endslatecopy_AnnotationLengthSet);
	$endslatecopyContent.append($endslatecopyAnnotationLengthSetButton);
	
	$endslatecopyContent.append('<div class="endslatecopy-clear"></div>');
	
	$endslatecopyAnnotationLengthInput.select();
}

function endslatecopy_VideoChosen() {
	chosenVideo = existingVideoDict[$endslatecopyVideoOptions.find('option:selected').val()];
	$endslatecopyVideoOptions.empty();
	$endslatecopyContent.empty();
	$endslatecopyContent.append(endslatecopy_CreateLoading('Fetching annotations'));
	
	jQuery.get("https://www.youtube.com/annotations_invideo?features=1&legacy=1&video_id=" + chosenVideo.id, function(e) {
		chosenVideoAnnotations = e;
		endslatecopy_GotAnnotations();
	});
}

function endslatecopy_NoVideosFound() {
	$endslatecopyContent.html('No videos found. Please refresh the page and try again if there should be videos here.');
}

function endslatecopy_FetchedAllVideos() {
	if(existingVideos.length < 1) {
		endslatecopy_NoVideosFound();
		return;
	}
	
	var $endslatecopyVideoSelectWrapper = jQuery('<span class="yt-uix-form-input-select privacy-select"></span>');
	
	$endslatecopyVideoOptions = jQuery('<select></select>');
	$endslatecopyVideoOptions.attr('id', 'endslatecopy-video-select');
	$endslatecopyVideoOptions.addClass('yt-uix-form-input-select-element');
	
	$endslatecopyVideoOptions.append(jQuery('<option value="">Select original video</option>'));
	for(var i=0; i<existingVideos.length; i++) {
		var v = existingVideos[i];
		var $o = jQuery('<option value="'+v.id+'">'+v.title+' ('+v.id+')</option>');
		$endslatecopyVideoOptions.append($o);
	}
	
	$endslatecopyContent.empty();
	
	$endslatecopyVideoSelectWrapper.append(jQuery('<span class="yt-uix-form-input-select-content endslatecopy-float-l"><span class="yt-uix-form-input-select-arrow yt-sprite"></span><span class="yt-uix-form-input-select-value">Select original video</span></span>'));
	$endslatecopyVideoSelectWrapper.append($endslatecopyVideoOptions);
	
	$endslatecopyContent.append($endslatecopyVideoSelectWrapper);
	
	$endslatecopyVideoSelectedButton = endslatecopy_CreateButton('Next');
	$endslatecopyVideoSelectedButton.addClass('endslatecopy-float-r');
	$endslatecopyVideoSelectedButton.attr('disabled','disabled');
	$endslatecopyVideoSelectedButton.click(function() {
		if(!jQuery(this)[0].hasAttribute('disabled'))
			endslatecopy_VideoChosen();
	});
	$endslatecopyContent.append($endslatecopyVideoSelectedButton);
	
	$endslatecopyVideoOptions.change(function() {
		var $o = jQuery(this).find('option:selected').first();
		if($o.val() == '')
			$endslatecopyVideoSelectedButton.attr('disabled','disabled');
		else
			$endslatecopyVideoSelectedButton.removeAttr('disabled');
	});
	
	$endslatecopyContent.append('<div class="endslatecopy-clear"></div>');
}

function endslatecopy_FetchVideos() {
	endslatecopy_FetchVideosFromPage(1);
}

function endslatecopy_FetchVideosFromPage(t) {
	jQuery.get("https://www.youtube.com/my_videos?o=U&pi=" + t, function(e) {
		var foundVideos = 0;
		while (match = findVideoPattern.exec(e)) {
			var lengthString = match[1];
		    var id = match[2];
		    var title = unescape(JSON.parse('"'+match[3]+'"'));
		    var o = {id:id, title:title, length:endslatecopy_TimeStringToSeconds(lengthString)};
		    existingVideos.push(o);
		    existingVideoDict[id] = o;
		    
		    foundVideos++;
		}
		
		if(foundVideos>0)
			endslatecopy_FetchVideosFromPage(t+1);
		else
			endslatecopy_FetchedAllVideos();
	});
}

jQuery(document).ready(endslatecopy_Main);