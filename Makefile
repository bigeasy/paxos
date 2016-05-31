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

sources = css/paxos.css index.html

all: $(sources)

node_modules/.bin/serve:
	npm install serve

node_modules/.bin/edify:
	npm install edify edify.markdown edify.highlight

watch: all
	fswatch fswatch --exclude '.' --include '\.html$$' --include '\.less$$' pages css | while read line; \
	do \
		make --no-print-directory all; \
		osascript -e "$$CHROME_REFRESH"; \
		osascript -e "$$SAFARI_REFRESH"; \
	done;

css/%.css: css/%.less
	node_modules/.bin/lessc $< > $@ || rm -f $@

%.html: pages/%.html node_modules/.bin/edify
	@echo generating $@
	@(node node_modules/.bin/edify markdown --select '.markdown' | \
	    node node_modules/.bin/edify highlight --select '.lang-javascript' --language 'javascript') < $< > $@

clean:
	rm $(sources)

serve: node_modules/.bin/serve
	node_modules/.bin/serve -p 4000
