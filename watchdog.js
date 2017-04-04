/**
 * Watchdog program
 */

"use strict";

var system = require('system');
var fs     = require('fs');
var config = require('./config');

// Location for the log files - should be updated via command line args
var sLogDir = 'logs';

// Flags for controlling asynchronous processes
var bLoadInProgress   = false;
var iTestIndex        = 0;

// PhantomJS connection and browser sizing
var page = require('webpage').create();
page.viewportSize = config.browser.size;

var errorMsg = function (sMsg) {
    console.log(sMsg);
    phantom.exit();
};

// Route "console.log()" calls from within the Page context to the main Phantom context
page.onConsoleMessage = function(sMsg) {
    // Avoiding weird errors
    if (sMsg.search('DFPTargetKeys') !== -1)
	return;
    console.log("Console message: " + sMsg + "\n");
};

page.onAlert = function(sMsg) {
    console.log('Alert: ' + sMsg);
};

page.onError = function(sMsg, aTrace) {
    var aMsgStack = ['JavaScript error: ' + sMsg];
    if (aTrace && aTrace.length) {
        aMsgStack.push('Trace:');
	var sLastMsg = "";
        aTrace.forEach(function(t) {
	    var sTraceMsg = ' -> ' + t.file + ': ' + t.line + (t.function ? ' (function "' + t.function + '")' : '');
	    if (sTraceMsg != sLastMsg) {
		aMsgStack.push(sTraceMsg);
		sLastMsg = sTraceMsg;
	    }
        });
    }
    console.error(aMsgStack.join("\n") + "\n");
};

page.onLoadStarted = function() {
    bLoadInProgress = true;
    // console.log("load started");
};


page.onLoadFinished = function(sStatus) {
    bLoadInProgress = false;
    if (sStatus !== 'success') {
        console.log('Unable to access network: ' + sStatus);
        phantom.exit();
    } else {
        // console.log("load finished\n");
    }
};

page.onResourceRequested = function(oRequest) {
    if (oRequest.url.search(config.ignore_resource_urls) === -1) {
	console.log("Request URL: " + oRequest.url + "\n" + JSON.stringify(oRequest) + "\n");
    }
};

page.onResourceReceived = function(oResponse) {
    if (oResponse.url.search(config.ignore_resource_urls) === -1) {
	console.log("Response URL: " + oResponse.url + "\nHeaders: " + JSON.stringify(oResponse.headers) + "\n");
    }
};

var getSnapshot = function (sFile) {
    page.render(sFile, { format: 'jpeg', quality: '80' });
};

var validateUrl = function (sUrl, sLocation, sImage) {
    if (page.url.search(sUrl) != 0) {
	var sImagePath   = sLogDir + "/" + sImage,
	    sContentPath = sLogDir + "/last-page.html",
	    sTextPath    = sLogDir + "/last-page.txt";
	console.log("Failed to reach " + sLocation + ": " + sUrl);
	console.log(" - final browser url: " + page.url);
	console.log(" - snapshot saved to: " + sImagePath);
	console.log(" - last page content saved to: " + sContentPath);
	console.log(" - last page text saved to: " + sTextPath);
	getSnapshot(sImagePath);
	fs.write(sContentPath, page.content, 'w');
	fs.write(sTextPath, page.plainText, 'w');
        phantom.exit();
    } else {
	console.log(sLocation + " successfully reached: " + page.url);
    }
};

var startSystem = function () {
    var args = system.args;
    var sProgram = args[0].replace('/^.*\/', '');
    if (args.length === 1) {
	errorMsg('Format: ' + sProgram + ' LOG-DIR');
    } else {
	sLogDir = args[1];
	if (fs.isDirectory(sLogDir) == false) {
	    errorMsg('Invalid log directory: ' + sLogDir);
	}
    }
};
    
// Array of steps to sequentially execute
var aSteps = [

    // Initialization of system
    function () {
	startSystem();
    },

    // Starting page
    function() {
        console.log("Starting URL: " + config.sites.start_url);
        page.open(config.sites.start_url);
    },

    // Login page
    function() {
	var oConfig = config.sites.login;
	validateUrl(oConfig.url, oConfig.description, oConfig.snapshot);
        page.evaluate(function(oConfig, oAuth) {
	    document.getElementById(oConfig.login_username).value = oAuth.username;
	    document.getElementById(oConfig.login_password).value = oAuth.password;
	    document.getElementById(oConfig.login_button).click();
	}, oConfig, config.oauth);
    },
    
    // Ending page
    function() {
	var oConfig = config.sites.ending;
	validateUrl(oConfig.url, oConfig.description, oConfig.snapshot);
    },

    // Keep final element 
    "done"
];


setInterval(function() {
    if (!bLoadInProgress && typeof aSteps[iTestIndex] == "function") {
        // console.log("step " + (iTestIndex + 1));
        aSteps[iTestIndex]();
        iTestIndex++;
    }
    if (typeof aSteps[iTestIndex] != "function") {
        // console.log("test complete!");
        phantom.exit();
    }
}, 50);
