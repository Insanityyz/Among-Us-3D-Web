/* Assemble the single-file build: index.html */
const fs=require('fs');
const path=require('path');
const {execFileSync}=require('child_process');

const DIR=__dirname;
const OUT=path.resolve(DIR,'..','index.html');

const JS_PARTS=require('./parts.js');

const head=fs.readFileSync(path.join(DIR,'00_head.html'),'utf8');
const css=fs.readFileSync(path.join(DIR,'10.css'),'utf8');
const body=fs.readFileSync(path.join(DIR,'20_body.html'),'utf8');
const js=JS_PARTS.map(f=>fs.readFileSync(path.join(DIR,f),'utf8')).join('\n');

const html=head
  + css.replace(/\s*$/,'')
  + '\n</style>\n</head>\n<body>\n'
  + body.replace(/^\s*/,'').replace(/\s*$/,'')
  + '\n\n<script type="module">\n'
  + js.replace(/\s*$/,'')
  + '\n</script>\n</body>\n</html>\n';

fs.writeFileSync(OUT,html,'utf8');

// validate the concatenated module parses as ESM
const tmp=path.join(DIR,'_check.mjs');
fs.writeFileSync(tmp,js,'utf8');
try{
  execFileSync(process.execPath,['--check',tmp],{stdio:'pipe'});
  console.log('node --check (ESM): PASS');
}catch(e){
  console.log('node --check (ESM): FAIL\n'+(e.stderr?e.stderr.toString():e.message));
  process.exitCode=1;
}finally{
  fs.unlinkSync(tmp);
}

const kb=n=>(n/1024).toFixed(1)+' KB';
console.log('parts      :',JS_PARTS.length+3);
console.log('css        :',kb(css.length));
console.log('html body  :',kb(body.length));
console.log('javascript :',kb(js.length));
console.log('index.html :',kb(html.length),'->',OUT);
