/**
 * Watchdog program
 */

"use strict";

var system = require('system');
var fs     = require('fs');
var config = require('./config');
var Q      = require('q');


// Location for the log files - should be updated via command line args
var sLogDir = 'logs';

// Flags for controlling asynchronous processes
var bLoadInProgress   = false;
var iTestIndex        = 0;

// PhantomJS connection and browser sizing
var page = require('webpage').create();
page.viewportSize = config.browser.size;

page.onError = function(sMsg, aTrace) {
    if (config.ignore_js_errors == false) {
	var aMsgStack = ['JavaScript error: ' + sMsg];
	if (aTrace && aTrace.length) {
            aMsgStack.push('Trace:');
	    var sLastMsg = "";
            aTrace.forEach(function(t) {
		var sTraceMsg = ' -> ' + t.file + ': ' + t.line +
		    (t.function ? ' (function "' + t.function + '")' : '');
		if (sTraceMsg != sLastMsg) {
		    aMsgStack.push(sTraceMsg);
		    sLastMsg = sTraceMsg;
		}
            });
	}
	console.log(aMsgStack.join("\n") + "\n");
    }
};

// Route "console.log()" calls from within the Page context to the main Phantom context
page.onConsoleMessage = function(sMsg) {
    var aSkipElements = config.ignore_console_errors;
    for (var n = 0; n < aSkipElements.length; n++) {
	if (sMsg.search(aSkipElements[n]) !== -1) {
	    return;
	}
    }
    console.log("Console message: " + sMsg + "\n");
};

page.onAlert = function(sMsg) {
    console.log(' ==> Alert: ' + sMsg);
};


// Log valid requests, skipping the unneeded requests
page.onResourceRequested = function(oRequest, oNetworkRequest) {
    if (oRequest.url.search(config.ignore_resource_urls) === -1) {
	page.logHeader("Request", oRequest.url, oRequest.headers, config.dump_request_header, []);
    } else {
	oNetworkRequest.abort();
    }
};

// Save the reason and URL in case of a resource error
page.onResourceError = function(resourceError) {
    if (resourceError.url.url.search(config.ignore_resource_urls) === -1) {
	page.sResourceError    = resourceError.errorString;
	page.sResourceErrorUrl = resourceError.url;
    }
};

page.sLastResourceUrl = "";
page.onResourceReceived = function(oResponse) {
    if (oResponse.url.search(config.ignore_resource_urls) === -1) {
	if (page.sLastResourceUrl == oResponse.url && oResponse.status == '200') {
	    return;
	}
	page.sLastResourceUrl = oResponse.url;
	page.logHeader("Response", oResponse.url, oResponse, config.dump_response_header,
		       ['Location', 'status']);
    }
};

page.logHeader = function (sDesc, sUrl, oHeader, sConfig, aFields) {

    // No URL defined - skip
    if (! sUrl) {
	return;
    }
    
    console.log(sDesc + " URL: " + sUrl);

    // Full display - simply dump the whole header
    if (sConfig == 'full') {
	console.log("Headers: " + JSON.stringify(oHeader) + "\n"); 
    }

    // Partial display of certain fields
    else if (sConfig == 'partial') {
	var sOutput = "", sValue;
	aFields.forEach(function (sField) {

	    // Defined as a primary property
	    if (oHeader[sField] !== undefined) {
		if (sField == 'status' && oHeader['statusText'] !== undefined) {
		    sValue = oHeader[sField] + " (" + oHeader['statusText'] + ")";
		    sField = "HTTP status code";
		} else {
		    sValue = oHeader[sField];
		}
		sOutput += "  " + sField + " => " + sValue + "\n";
	    }

	    // Search in the headers array of objects
	    else if (oHeader.headers !== undefined) {
		oHeader.headers.forEach(function (oBlock) {
		    if (oBlock.name === sField) {
			sOutput += "  " + sField + " => " + oBlock.value + "\n";
		    }
		});
	    }
	});
	console.log(sOutput);
    }

    else {
	console.log("");
    }
	
}

var statusMsg = function (sMsg) {
    console.log("\n ==> " + sMsg);
};

var getSnapshot = function (sImage) {
    var sImagePath = sLogDir + "/" + sImage;
    console.log("  - snapshot saved to: " + sImagePath);
    page.render(sImagePath, { format: 'jpeg', quality: '40' });
};

var recordLastPage = function (sImage) {
    var sContentPath = sLogDir + "/last-page.html",
	sTextPath    = sLogDir + "/last-page.txt";
    console.log("  - final browser url: " + page.url);
    console.log("  - last page content saved to: " + sContentPath);
    console.log("  - last page text saved to: " + sTextPath);
    getSnapshot(sImage);
    fs.write(sContentPath, page.content, 'w');
    fs.write(sTextPath, page.plainText, 'w');
};

var validateUrl = function (sUrl, sLocation, sImage) {
    if (page.url.search(sUrl) != 0) {
	statusMsg("Failed to reach " + sLocation + ": " + sUrl);
	recordLastPage(sImage);
	return false;
    } else {
	statusMsg(sLocation + " successfully reached: " + page.url);
	return true;
    }
};

var startQ = function () {
    var oDeferred = Q.defer();
    oDeferred.resolve(true);
    return oDeferred.promise;
};
		       
var initSystem = function () {
    var args = system.args;
    var oDeferred = Q.defer();
    var sProgram = args[0].replace('/^.*\/', '');
    statusMsg("Initializing system");
    if (args.length === 1) {
        oDeferred.reject(new Error('Format: ' + sProgram + ' LOG-DIR'));
    } else {
	sLogDir = args[1];
	if (fs.isDirectory(sLogDir) == false) {
            oDeferred.reject(new Error('Invalid log directory: ' + sLogDir));
	} else {
            oDeferred.resolve(true);
	}
    }
    return oDeferred.promise;
};
    
var startPage = function () {
    var oConfig   = config.sites.start;
    var sStartUrl = oConfig.url;
    var oDeferred = Q.defer();
    
    statusMsg("Starting URL: " + sStartUrl);
    page.open(sStartUrl, function (sStatus) {
        if (sStatus !== 'success') {
	    recordLastPage(oConfig.snapshot);
            oDeferred.reject(new Error('Cannot read the url : ' + sStartUrl));
	} else {
	    getSnapshot(oConfig.snapshot);
            oDeferred.resolve(true);
	}
    });
    return oDeferred.promise;
};
	      
var loginPage = function () {
    var oConfig    = config.sites.login;
    var oEndConfig = config.sites.ending;
    var oDeferred  = Q.defer();
    
    // Already reaching the end page, probably through cookies - skip the login page
    if (page.url.search(oEndConfig.url) == 0) {
        statusMsg("Login form skipped - already logged in");
        oDeferred.resolve(true);
	return oDeferred.promise;
    }
	
    // Validate the login page
    if (! validateUrl(oConfig.url, oConfig.description, oConfig.snapshot)) {
        oDeferred.reject(new Error("Login page not validated"));
	recordLastPage(oConfig.snapshot);
	return oDeferred.promise;
    }

    // Verify the existence of the elements (may be an invalid page despite the URL match)
    if (! page.evaluate(function(oConfig, oAuth) {
	return (document.getElementById(oConfig.login_username) !== null &&
		document.getElementById(oConfig.login_password) !== null &&
		document.getElementById(oConfig.login_button) !== null);
    }, oConfig)) {
	statusMsg("Could not find page elements needed to log in");
	recordLastPage(oConfig.snapshot);
        oDeferred.reject(new Error("Login page not reached"));
	return oDeferred.promise;
    }

    // Get the latest snapshot
    getSnapshot(oConfig.snapshot);

    // Function to be run after evaluation
    page.onLoadFinished = function (status) {
        if (status != 'success') {
	    var sStatus = "Page load failed";
	    if (typeof page.sResourceError !== 'undefined') {
		sStatus += ", resource error reason: " + page.sResourceError + " url: " + page.sResourceErrorUrl;
	    }
            oDeferred.reject(new Error(sStatus));
        } else {
            oDeferred.resolve(true);
            statusMsg("Login form submited");
	}
    }

    // Submit the login page
    page.evaluate(function(oConfig, oAuth) {
        document.getElementById(oConfig.login_username).value = oAuth.username;
        document.getElementById(oConfig.login_password).value = oAuth.password;
        document.getElementById(oConfig.login_button).click();
    }, oConfig, config.oauth);
    return oDeferred.promise;
};

var endPage = function (oConfig) {
    var oConfig = config.sites.ending;
    var oDeferred = Q.defer();
    if (! validateUrl(oConfig.url, oConfig.description, oConfig.snapshot)) {
	recordLastPage(oConfig.snapshot);
        return oDeferred.reject(new Error("End page not validated"));
    } 
    oDeferred.resolve(true);
    return oDeferred.promise;
};

var closeBrowser = function () {
    statusMsg("Closing session...");
    var oDeferred = Q.defer();
    setTimeout(function () {
        oDeferred.resolve(true);
        statusMsg("Session closed");
        phantom.exit();
    }, 50);
    return oDeferred.promise;
};

var errorMsg = function (sMsg) {
    console.log(sMsg);
    statusMsg("Closing PhantomJS...");
    phantom.exit();
};

startQ()
    .then(initSystem)
    .then(startPage)
    .then(loginPage)
    .then(endPage)
    .then(closeBrowser)
    .fail(errorMsg);
