/** @file 验证离线操作按编辑顺序投影到原生角标，并在请求重叠时保留最新快照。 */
import { runInNewContext } from "node:vm";
import { assertEquals } from "@std/assert";

Deno.test("offline badge sends the latest per-record edit without network and serializes overlapping changes", async () => {
  const events = new Map<string, () => void>();
  const sent: unknown[] = [];
  let release!: () => void;
  let operations = [
    {kind:"record",target:"/matches/restore",stamp:{editedAt:2},records:[{id:"one",postId:"p"}]},
    {kind:"record",target:"/matches/complete",stamp:{editedAt:1},records:[{id:"one",postId:"p"}]},
  ];
  const scope = {
    appNative: {localBadge: (value: unknown) => {sent.push(structuredClone(value)); return new Promise<void>(resolve => {release=resolve;});}},
    applicationSync:{ready:Promise.resolve(),userId:"alice"},
    AppLocalStore:{pending:()=>Promise.resolve(operations)},
    document:{querySelectorAll:()=>[],getElementById:()=>null,addEventListener:(name:string,callback:()=>void)=>events.set(name,callback)},
    addEventListener:()=>{},
  };
  runInNewContext(await Deno.readTextFile(new URL("../static/app-device-settings.js",import.meta.url)),scope);
  events.get("application-local-records")!();
  await new Promise(resolve=>setTimeout(resolve,0));
  assertEquals(sent,[{userId:"alice",records:[{id:"one",postId:"p",workspace:true}]}]);
  operations=[{kind:"record",target:"/matches/delete",stamp:{editedAt:3},records:[{id:"one",postId:"p"}]}];
  events.get("application-local-records")!();
  release();
  await new Promise(resolve=>setTimeout(resolve,0));
  assertEquals(sent[1],{userId:"alice",records:[{id:"one",postId:"p",workspace:false}]});
  operations=[];
  events.get("application-local-records")!(); release();
  await new Promise(resolve=>setTimeout(resolve,0));
  assertEquals(sent[2],{userId:"alice",records:[]}); release();
});
