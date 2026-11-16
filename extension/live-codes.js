// Visible codes are transient UI data. Passive refresh never extends the
// vault's unlock lifetime; locking or hiding the UI invalidates pending reads.
export class LiveCodes {
  constructor(read,now=()=>Date.now()) {this.read=read;this.now=now;this.values=new Map();this.ids=[];this.generation=0;this.pending=null;}
  setAccounts(accounts) {this.ids=accounts.filter(account=>account.supported).map(account=>account.id);}
  get(id) {const value=this.values.get(id);return value && value.expiresAt>this.now() ? value : null;}
  clear() {this.values.clear();this.generation++;this.pending=null;}
  async refresh() {
    if(!this.ids.length || this.ids.every(id=>this.get(id)))return;
    if(this.pending)return this.pending;
    const generation=this.generation;
    const pending=(async()=>{
      const result=await this.read();
      if(generation!==this.generation)return;
      this.values.clear();
      for(const value of result.codes || [])if(this.ids.includes(value.id) && /^\d{6}$/.test(value.code) && value.expiresAt>this.now())this.values.set(value.id,value);
    })();
    this.pending=pending;
    try{await pending;}finally{if(this.pending===pending)this.pending=null;}
  }
}
