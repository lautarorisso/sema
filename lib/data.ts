import type { Activity, Definition, Store } from "./types";
export const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
export const SHORT_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
export const DEFINITIONS: Definition[] = [
{name:"Sleep",category:"Health",min:420,target:480,max:540,unit:"per night",guidance:"Evidence-based",why:"Most adults benefit from at least 7 hours of sleep. Your personal need may vary."},
{name:"Exercise",category:"Health",min:75,target:150,max:300,unit:"per week",guidance:"Evidence-based",why:"Based on widely used adult physical activity guidance; spread sessions in a way you can sustain."},
{name:"Study",category:"Learning",min:120,target:300,max:600,unit:"per week",guidance:"Evidence-informed",why:"Short, distributed sessions support retrieval and reduce fatigue better than one long block."},
{name:"Deep work",category:"Responsibilities",min:180,target:420,max:720,unit:"per week",guidance:"Practical",why:"Protected focus blocks create room for demanding work. Adjust to your role and energy."},
{name:"Admin",category:"Responsibilities",min:30,target:90,max:180,unit:"per week",guidance:"Practical",why:"Batching small tasks can reduce context switching."},
{name:"Friends & family",category:"Life",min:60,target:180,max:420,unit:"per week",guidance:"Evidence-informed",why:"Regular social connection is associated with wellbeing; quality matters more than a quota."},
{name:"Creative time",category:"Life",min:45,target:120,max:300,unit:"per week",guidance:"Practical",why:"Unstructured creative time can restore attention and make space for curiosity."},
];
const a=(id:string,name:string,category:Activity["category"],day:number,start:number,duration:number,source:Activity["source"]="custom"):Activity=>({id,name,category,day,start,duration,source});
export const DEMO: Store={version:1,activePlanId:"demo",templates:[],preferences:{density:"comfortable",showSleep:true,hintDismissed:false},plans:[{id:"demo",name:"A balanced week",weekOf:"Aug 17, 2026",activities:[
...Array.from({length:7},(_,d)=>a(`sleep-${d}`,"Sleep","Health",d,23*60,60,"predefined")),
...Array.from({length:7},(_,d)=>a(`sleep-am-${d}`,"Sleep","Health",d,0,7*60,"predefined")),
a("mon-focus","Deep work","Responsibilities",0,9*60,120,"predefined"),a("mon-study","Study","Learning",0,14*60,90,"predefined"),a("tue-ex","Exercise","Health",1,7*60+30,45,"predefined"),a("tue-admin","Admin","Responsibilities",1,10*60,90,"predefined"),a("wed-focus","Deep work","Responsibilities",2,9*60,150,"predefined"),a("wed-social","Friends & family","Life",2,18*60,120,"predefined"),a("thu-study","Study","Learning",3,13*60,120,"predefined"),a("fri-focus","Deep work","Responsibilities",4,9*60,120,"predefined"),a("sat-create","Creative time","Life",5,11*60,120,"predefined"),a("sun-social","Friends & family","Life",6,16*60,120,"predefined")]}]};
