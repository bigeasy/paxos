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
	done;

css/%.css: css/%.less
	node_modules/.bin/lessc $< > $@ || rm -f $@

%.html: pages/%.html node_modules/.bin/edify
	@echo generating $@
	@(node node_modules/.bin/edify markdown --select '.markdown' | \
	    node node_modules/.bin/edify highlight --select 'pre.javascript' --language 'javascript') < $< > $@

clean:
	rm $(sources)

serve: node_modules/.bin/serve
	node_modules/.bin/serve -p 4000
