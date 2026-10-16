/* Rootling Pet Playground — original dependency-free mini-games, MIT license. */
const TITLES = {treasure:'Treasure Buddies',says:'Pet Says',home:'Build Our Home',puzzle:'Puzzle Partners',hide:'Hide-and-Seek'};
const SYMBOLS=['Star','Leaf','Moon','Shell'];
const ITEMS=['Soft rug','Reading lamp','Plant','Toy basket','Shell display','Star cushion'];
const pick=n=>Math.floor(Math.random()*n);
const fresh=()=>({version:1,games:{},room:Array(6).fill(null),inventory:['Soft rug','Reading lamp','Plant','Toy basket'],rewards:[],seen:[]});
const css=`:host{display:block;color:var(--playground-text,#172b27);font:inherit}*{box-sizing:border-box}section{background:var(--playground-bg,#f4faf6);border:2px solid var(--playground-border,#426e5a);border-radius:18px;padding:18px;max-width:760px;margin:auto}h2,h3{margin:.5em 0}button,select{font:inherit;min-height:48px;padding:10px;border:2px solid #426e5a;border-radius:10px;background:#fff;color:#172b27;margin:4px;cursor:pointer}button:focus-visible,select:focus-visible{outline:4px solid #a64e00;outline-offset:3px}button:disabled{opacity:.65;cursor:default}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.menu{display:flex;flex-wrap:wrap}.pet{border-left:4px solid #426e5a;padding:10px;margin:12px 0}.pet img{width:96px;height:96px;object-fit:contain}.status{min-height:3em}.small{font-size:.9em}.room button{min-height:90px}@media(max-width:420px){section{padding:10px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(forced-colors:active){button,section{border-color:ButtonText}}`;
export function mountPlayground(target, options={}) { return new Playground(target,options); }
class Playground {
  constructor(target,options){
    this.host=typeof target==='string'?document.querySelector(target):target;
    if(!this.host)throw new Error('Pet Playground mount target not found');
    if(!options.accountId||!options.pet?.id)throw new Error('Stable accountId and pet.id are required');
    this.o=options; this.pet={...options.pet}; this.active=null; this.paused=false; this.destroyed=false;
    this.key='rootling:playground:v1:'+JSON.stringify([String(options.accountId),String(this.pet.id)]);
    this.store=options.storage||window.localStorage; this.storageWarning='';
    this.state=fresh();
    try{const raw=this.store.getItem(this.key); if(raw){const x=JSON.parse(raw); if(!valid(x))throw Error('Unsupported or invalid game save');this.state=x;}}
    catch(e){throw new Error('Playground save could not be loaded. Preserve it and offer retry/export; do not overwrite it. '+e.message);}
    this.root=this.host.attachShadow({mode:'open'});
    this.click=e=>{const b=e.target.closest('button[data-action]');if(b&&!b.disabled)this.act(b.dataset.action,b.dataset.value);};
    this.change=e=>{if(e.target.dataset.setting==='item'){this.item=e.target.value;}};
    this.visibility=()=>{if(document.hidden&&this.active){this.paused=true;this.render();}};
    this.root.addEventListener('click',this.click);this.root.addEventListener('change',this.change);
    document.addEventListener('visibilitychange',this.visibility);this.render();
  }
  save(){try{this.store.setItem(this.key,JSON.stringify(this.state));this.storageWarning='';}catch(e){this.storageWarning='Progress is currently in memory only. Storage is unavailable or full. Keep this page open or export your save.';}}
  button(label,action,value='',disabled=false){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.action=action;b.dataset.value=value;b.disabled=disabled;return b;}
  text(tag,value,parent=this.body){const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;}
  grid(){const d=document.createElement('div');d.className='grid';this.body.append(d);return d;}
  say(message){this.message=message;}
  start(id,restart=false){
    this.active=id;this.paused=false;this.message='';
    if(restart||!this.state.games[id]){
      let g={id:globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random(),done:false};
      if(id==='treasure')Object.assign(g,{keys:[0,1,2,3,4,5,6,7,8].sort(()=>Math.random()-.5).slice(0,3),opened:[],found:0});
      if(id==='says')Object.assign(g,{sequence:Array.from({length:3},()=>pick(4)),phase:'watch',step:0,user:[],echo:0});
      if(id==='home')Object.assign(g,{placed:0});
      if(id==='puzzle')Object.assign(g,{switches:[false,false,false],turn:'user',crossed:false});
      if(id==='hide')Object.assign(g,{position:pick(9),opened:[],phase:'find',toy:null,clue:false});
      this.state.games[id]=g;this.save();
    }
    this.render(true);
  }
  complete(label){
    const g=this.state.games[this.active];if(g.done)return;
    g.done=true;
    const reward={id:g.id,game:this.active,label,petId:String(this.pet.id),completedAt:new Date().toISOString(),suggestedXp:5};
    this.state.rewards.push(reward);
    if(this.active==='treasure'&&!this.state.inventory.includes('Shell display'))this.state.inventory.push('Shell display');
    if(this.active==='hide'&&!this.state.inventory.includes('Star cushion'))this.state.inventory.push('Star cushion');
    this.save();
    // Host owns XP transactions. Replay of a round never emits another reward.
    // The host must deduplicate reward.id and implement any desired XP policy.
    this.host.dispatchEvent(new CustomEvent('rootling:playground-complete',{detail:{...reward},bubbles:true}));
    if(typeof this.o.onComplete==='function')Promise.resolve().then(()=>this.o.onComplete({...reward})).catch(()=>{if(!this.destroyed){this.say('Adventure saved. The app could not sync its reward; your game progress is safe.');this.render();}});
    this.say(label+' We did that together. You can finish here.');
  }
  act(action,value){
    if(action==='open'){this.start(value);return;}
    if(action==='back'){this.active=null;this.paused=false;this.message='';this.render(true);return;}
    if(action==='pause'){this.paused=!this.paused;this.render(true);return;}
    if(action==='export'){this.download();return;}
    if(action==='new'){this.start(this.active,true);return;}
    if(!this.active||this.paused)return;
    const g=this.state.games[this.active];const n=Number(value);
    if(action==='hint'){
      const hints={treasure:'Try space '+((g.keys||[]).find(x=>!g.opened.includes(x))+1)+'. I can hold the lantern.',says:'Follow the written sequence. There is no speed requirement.',home:'Choose a decoration, then choose a room space. You can change it later.',puzzle:'Turn on each switch, then choose My pet’s turn. We take turns building the bridge.',hide:g.phase==='find'?'I am hiding in '+['the top row','the middle row','the bottom row'][Math.floor(g.position/3)]+'.':'Choose any space for the toy, then give me a clue.'};
      this.say(hints[this.active]);
    }
    if(action==='treasure'&&!g.done&&!g.opened.includes(n)){
      g.opened.push(n);if(g.keys.includes(n)){g.found++;this.say('You found a key! I will carry it. '+g.found+' of 3 keys.');}else this.say('A smooth pebble. I will check the map while you choose another space.');
    }
    if(action==='chest'&&g.found===3&&!g.done)this.complete('We opened the treasure chest and found a shell display!');
    if(action==='watch'&&!g.done){g.step++;if(g.step>=g.sequence.length){g.phase='repeat';g.step=0;}this.say(g.phase==='repeat'?'Your turn. You can keep the sequence visible.':'Here is my next symbol.');}
    if(action==='symbol'&&g.phase==='repeat'&&!g.done){
      if(n===g.sequence[g.step]){g.step++;this.say('That matches.');if(g.step===g.sequence.length){g.phase='create';g.step=0;this.say('Now make a three-symbol sequence for me to copy.');}}
      else this.say('Let’s try that symbol again. The sequence is still here.');
    }
    if(action==='symbol'&&g.phase==='create'&&!g.done&&g.user.length<3){g.user.push(n);if(g.user.length===3){g.phase='echo';this.say('My turn to copy your sequence.');}}
    if(action==='echo'&&g.phase==='echo'&&!g.done){this.say('I choose '+SYMBOLS[g.user[g.echo]]+'.');g.echo++;if(g.echo===g.user.length)this.complete('We both learned each other’s sequence!');}
    if(action==='place'&&!g.done){this.state.room[n]=this.item||this.state.inventory[0];g.placed++;this.say('I carried the '+this.state.room[n]+' to space '+(n+1)+'. Want to try it there?');}
    if(action==='homeFinish'&&!g.done)this.complete('Our cozy room is ready for a rest!');
    if(action==='switch'&&g.turn==='user'&&!g.done){g.switches[n]=!g.switches[n];g.turn='pet';this.say('Your switch is '+(g.switches[n]?'on':'off')+'. My turn to help.');}
    if(action==='petBridge'&&g.turn==='pet'&&!g.done){g.turn='user';if(g.switches.every(Boolean)){g.crossed=true;this.complete('You connected the path, and I brought our supplies across!');}else this.say('I secured a bridge rope. Your turn to choose another switch.');}
    if(action==='hideFind'&&!g.done&&g.phase==='find'&&!g.opened.includes(n)){g.opened.push(n);if(n===g.position){g.phase='toy';this.say('You found me! Now hide my toy in any space.');}else this.say('Not here. You can ask me for a hint.');}
    if(action==='toy'&&g.phase==='toy'&&!g.done){g.toy=n;g.phase='petSearch';this.say('Toy hidden. Give me a clue so I can find it.');}
    if(action==='clue'&&g.phase==='petSearch'){g.clue=true;this.say('You tell me: look in '+['the top row','the middle row','the bottom row'][Math.floor(g.toy/3)]+'.');}
    if(action==='petFind'&&g.phase==='petSearch'&&g.clue&&!g.done)this.complete('With your clue I found the toy in space '+(g.toy+1)+'! We earned a star cushion.');
    this.save();this.render();
  }
  render(focus=false){
    if(this.destroyed)return;
    const previous=this.root.activeElement;const prior=previous?.dataset.action;const pv=previous?.dataset.value;
    this.root.replaceChildren();const style=document.createElement('style');style.textContent=css;this.root.append(style);
    this.body=document.createElement('section');this.body.setAttribute('aria-label','Pet Playground');this.root.append(this.body);
    const heading=this.text('h2',this.active?TITLES[this.active]:'Pet Playground');heading.tabIndex=-1;
    this.text('p','Play together. No timer, no penalties. Stopping is always okay.');
    const petBox=document.createElement('div');petBox.className='pet';this.body.append(petBox);
    // Host renderer must return a fresh DOM node, not move the existing Home pet.
    if(this.o.renderPet){try{const node=this.o.renderPet({...this.pet},{game:this.active,paused:this.paused});if(node instanceof Node)petBox.append(node);}catch{}}
    this.text('p',(this.pet.name||'Your pet')+' is here with you.',petBox);
    const controls=document.createElement('div');this.body.append(controls);
    if(this.active){controls.append(this.button('Back to games','back'),this.button(this.paused?'Resume':'Pause','pause'));}
    controls.append(this.button('Export game save','export'));
    if(this.storageWarning)this.text('p',this.storageWarning).setAttribute('role','alert');
    if(!this.active){
      const menu=document.createElement('div');menu.className='menu';this.body.append(menu);
      for(const [id,title]of Object.entries(TITLES))menu.append(this.button(title+(this.state.games[id]&&!this.state.games[id].done?' — continue':''),'open',id));
      this.text('p','Adventures completed: '+this.state.rewards.length+'. Saved for this account and this pet only.');
    }else if(this.paused){this.text('p','Paused. Nothing changes while you rest.');}
    else{
      const g=this.state.games[this.active];
      if(this.active==='treasure')this.treasure(g);
      if(this.active==='says')this.says(g);
      if(this.active==='home')this.home(g);
      if(this.active==='puzzle')this.puzzle(g);
      if(this.active==='hide')this.hide(g);
      if(!g.done)this.body.append(this.button('Help me','hint'));
      if(g.done){this.text('p','This adventure is complete. Your keepsake stays.');this.body.append(this.button('Play a new round','new'));}
    }
    const status=this.text('p',this.message||'Choose what feels right.');status.className='status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
    if(focus)heading.focus();else if(prior){const b=[...this.root.querySelectorAll('button')].find(x=>x.dataset.action===prior&&x.dataset.value===pv&&!x.disabled);if(b)b.focus();}
  }
  treasure(g){this.text('h3','Find three keys, then let your pet open the chest.');this.text('p','Keys: '+g.found+' / 3');const d=this.grid();for(let i=0;i<9;i++)d.append(this.button(g.opened.includes(i)?(g.keys.includes(i)?'Key found':'Pebble found'):'Search space '+(i+1),'treasure',String(i),g.done||g.opened.includes(i)));this.body.append(this.button('Your turn: open the chest','chest','',g.done||g.found<3));}
  says(g){
    this.text('h3','We take turns making and copying patterns.');
    if(g.phase==='watch'){this.text('p','My symbol '+(g.step+1)+' of 3: '+SYMBOLS[g.sequence[g.step]]);this.body.append(this.button('Show next / my turn','watch'));}
    if(g.phase==='repeat'){this.text('p','My sequence: '+g.sequence.map(x=>SYMBOLS[x]).join(' → '));this.text('p','Choose symbol '+(g.step+1)+' of 3.');}
    if(g.phase==='create')this.text('p','Your pattern: '+(g.user.map(x=>SYMBOLS[x]).join(' → ')||'Choose any three symbols.'));
    if(['repeat','create'].includes(g.phase)){const d=this.grid();SYMBOLS.forEach((s,i)=>d.append(this.button(s,'symbol',String(i),g.done)));}
    if(g.phase==='echo'){this.text('p','Your pattern: '+g.user.map(x=>SYMBOLS[x]).join(' → '));this.text('p','Pet copied: '+g.user.slice(0,g.echo).map(x=>SYMBOLS[x]).join(' → '));this.body.append(this.button('Your turn: copy my next symbol','echo','',g.done));}
  }
  home(g){this.text('h3','Choose a decoration, then a space. Your pet carries it.');const label=this.text('label','Decoration: ');const s=document.createElement('select');s.dataset.setting='item';label.append(s);for(const item of this.state.inventory){const op=document.createElement('option');op.value=item;op.textContent=item;s.append(op);}if(!this.state.inventory.includes(this.item))this.item=this.state.inventory[0];s.value=this.item;const d=this.grid();d.classList.add('room');this.state.room.forEach((item,i)=>d.append(this.button('Space '+(i+1)+': '+(item||'empty'),'place',String(i),g.done)));this.body.append(this.button('Let’s enjoy our room','homeFinish','',g.done));}
  puzzle(g){this.text('h3','Light the bridge switches. Your pet secures the ropes between your turns.');this.text('p',g.done?'We crossed together.':g.turn==='user'?'Your turn: choose a switch.':'Your pet’s turn.');const d=this.grid();g.switches.forEach((v,i)=>{const b=this.button('Switch '+(i+1)+': '+(v?'on':'off'),'switch',String(i),g.done||g.turn!=='user');b.setAttribute('aria-pressed',String(v));d.append(b);});this.body.append(this.button('My pet’s turn','petBridge','',g.done||g.turn!=='pet'));}
  hide(g){this.text('h3',g.phase==='find'?'Where is your pet hiding?':g.phase==='toy'?'Your turn: hide the toy.':'Your pet searches with your help.');const d=this.grid();for(let i=0;i<9;i++){let label='Space '+(i+1);if(g.phase==='find'&&g.opened.includes(i))label+=': checked';if(g.phase!=='find'&&i===g.position)label+=': pet was here';if(g.toy===i)label+=': hidden toy';d.append(this.button(label,g.phase==='find'?'hideFind':'toy',String(i),g.done||(g.phase==='find'&&g.opened.includes(i))||g.phase==='petSearch'));}if(g.phase==='petSearch')this.body.append(this.button('Give my pet a clue','clue','',g.done),this.button('My pet’s turn: search','petFind','',g.done||!g.clue));}
  updatePet(pet){if(String(pet.id)!==String(this.pet.id))throw Error('Unmount and remount when switching pets');this.pet={...pet};this.render();}
  exportSave(){return JSON.parse(JSON.stringify(this.state));}
  download(){const blob=new Blob([JSON.stringify(this.exportSave(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='rootling-playground-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  destroy(){this.destroyed=true;this.save();document.removeEventListener('visibilitychange',this.visibility);this.root.removeEventListener('click',this.click);this.root.removeEventListener('change',this.change);this.root.replaceChildren();}
}
function valid(x){return x&&x.version===1&&x.games&&typeof x.games==='object'&&Array.isArray(x.room)&&x.room.length===6&&Array.isArray(x.inventory)&&x.inventory.every(v=>ITEMS.includes(v))&&x.room.every(v=>v===null||ITEMS.includes(v))&&Array.isArray(x.rewards)&&Object.entries(x.games).every(([k,g])=>Object.hasOwn(TITLES,k)&&g&&typeof g.id==='string'&&typeof g.done==='boolean'&&(k!=='treasure'||(Array.isArray(g.keys)&&g.keys.length===3&&g.keys.every(n=>Number.isInteger(n)&&n>=0&&n<9)&&Array.isArray(g.opened)&&Number.isInteger(g.found)))&&(k!=='says'||(Array.isArray(g.sequence)&&g.sequence.length===3&&g.sequence.every(n=>Number.isInteger(n)&&n>=0&&n<4)&&['watch','repeat','create','echo'].includes(g.phase)&&Array.isArray(g.user)&&g.user.every(n=>Number.isInteger(n)&&n>=0&&n<4)&&Number.isInteger(g.step)&&Number.isInteger(g.echo)))&&(k!=='puzzle'||(Array.isArray(g.switches)&&g.switches.length===3&&g.switches.every(v=>typeof v==='boolean')&&['user','pet'].includes(g.turn)))&&(k!=='hide'||(Number.isInteger(g.position)&&g.position>=0&&g.position<9&&Array.isArray(g.opened)&&['find','toy','petSearch'].includes(g.phase))))}
