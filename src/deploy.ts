/** @file 根据部署配置选择完整服务或迁移后的旧网址入口。 */
if (Deno.env.get("HEYBOX_LEGACY_LANDING") === "true") {
  const { legacyLanding } = await import("./legacy_landing.ts");
  Deno.serve({ port: Number(Deno.env.get("PORT") ?? "8000") }, legacyLanding);
} else {
  await import("./deploy_active.ts");
}
