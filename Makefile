# Can't get this to work right now, complaints about JavaScript security. Would
# update to reload the current page if the current page was the correct page,
# rather than look through all tabs for the correct pages.
#
# http://www.finetunedmac.com/forums/ubbthreads.php?ubb=showflat&Number=40638
define SAFARI_REFRESH
tell application "Safari"
set windowList to every window
repeat with aWindow in windowList
	set tabList to every tab of aWindow
	if tabList is not equal to missing value then
		repeat with atab in tabList
			if (URL of atab contains "127.0.0.1:4000") then
			  do shell script "echo 1"
			end if
		end repeat
	end if
end repeat
end tell
endef

#			  tell atab to do javascript "window.location.reload()"

define CHROME_REFRESH
on run keyword
	tell application "Google Chrome"
		set windowList to every window
		repeat with aWindow in windowList
			set tabList to every tab of aWindow
			repeat with atab in tabList
				if (URL of atab contains "127.0.0.1:4000") then
					tell atab to reload
				end if
			end repeat
		end repeat
	end tell
end run
endef

export SAFARI_REFRESH
export CHROME_REFRESH

PATH  := "$(PATH):$(PWD)/node_modules/.bin"
SHELL := env PATH=$(PATH) /bin/sh

javascript := $(filter-out ../_%, $(wildcard ../*.js))
sources := $(patsubst ../%.js,source/%.js.js,$(javascript))
docco := $(patsubst source/%.js.js,docco/%.js.html,$(sources))
outputs := $(docco) css/style.css index.html

all: $(outputs)

node_modules/.bin/docco:
	mkdir -p node_modules
	npm install docco@0.7.0
	cd node_modules && patch -p 1 < ../docco.js.patch

node_modules/.bin/serve:
	mkdir -p node_modules
	npm install serve@1.4.0

node_modules/.bin/lessc:
	mkdir -p node_modules
	npm install less

node_modules/.bin/edify:
	mkdir -p node_modules
	npm install less edify edify.pug edify.markdown edify.highlight edify.include

watch: all
	fswatch --exclude '.' --include '\.pug$$' --include '\.less$$' --include '\.md$$' --include '\.js$$' pages css $(javascript) *.md | while read line; \
	do \
		make --no-print-directory all; \
		osascript -e "$$CHROME_REFRESH"; \
	done;

css/%.css: css/%.less node_modules/.bin/lessc
	node_modules/.bin/lessc $< > $@ || rm -f $@

source/%.js.js: ../%.js
	mkdir -p source
	cp $< $@

$(docco): $(sources) node_modules/.bin/docco
	mkdir -p docco
	node_modules/.bin/docco -o docco -c docco.css source/*.js.js
	sed -i '' -e 's/[ \t]*$$//' docco/*.js.html
	sed -i '' -e 's/\.js\.js/.js/' docco/*.js.html

index.html: index.md

%.html: pages/%.pug node_modules/.bin/edify
	@echo generating $@
	@(node node_modules/.bin/edify pug | \
		node_modules/.bin/edify include --select '.include' --type text | \
	    node node_modules/.bin/edify markdown --select '.markdown' | \
	    node node_modules/.bin/edify highlight --select '.lang-javascript' --language 'javascript') < $< > $@

clean:
	rm -f $(outputs)

# Use `--no-less` or else Serve will compile our less minified.
serve: node_modules/.bin/serve
	node_modules/.bin/serve --no-less --port 4000

.INTERMEDIATE: $(sources)
