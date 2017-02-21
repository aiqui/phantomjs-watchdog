# phantomjs-watchdog
PhantomJS oAuth website watchdog with Slack and CloudWatch features

## What does this do?
This system is a watchdog for oAuth authentication that will report
back on the command line, in Slack and through CloudFront.

## Configuration
Copy the two configuration files and edit accordingly:

```bash
$ cp config.js.template config.js
$ cp watchdog-run.ini.template watchdog-run.ini
```

Here are some of the values you'll need to set in **config.js**:

1. **USERNAME** and **PASSWORD** - these will be used to log into the site

2. **start_url** - this is where the system will first go, and should
forward to the authentication through oAuth

3. **login values** - the site is checked for the correct URL, and you'll
need to get the IDs in the form for the login username, password and
button

4. **ending values** - this should be set to the URL of the ending page

And here are some of the values to be set in **watchdog-run.ini**:

1. **reporting URL** - a protected site with the reports created by this
program

2. location of PhantomJS (download a version of PhantomJS)

3. optional Slack configuration

4. optional CloudWatch configuration

## How to run the program
```bash
./watchdog-run.py
```