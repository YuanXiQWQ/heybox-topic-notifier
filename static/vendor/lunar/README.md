# 农历计算模块

来源：[6tail/lunar-javascript v1.7.7](https://github.com/6tail/lunar-javascript/tree/v1.7.7)，遵循同目录的 MIT LICENSE。

`lunar.js` 保留上游历法算法与数据，将外层 UMD 入口适配为独立初始化的 ES 模块；变量按读写和作用域使用 `const` / `let`，并补充十六进制转换参数的类型注释。模块供浏览器、原生离线页面与服务端共用，不依赖宿主 AMD 加载器或系统 ICU 的农历版本。

日期选择器支持公元 100—9999 年。公历日期通过儒略日换算，保持格里高利历规则一致。干支在所选历法年初换年，参照年份仅用于用户切换历法或纪年时消除歧义，不限制循环规则的执行。

`deno run --allow-read --allow-write scripts/generate_polling_calendar_profiles.ts` 根据同一版本的历法计算生成 `static/polling-calendar-profiles.js`。该文件去重保存日期选择器支持范围内所有实际年结构，供跨历法闭环检查使用。更新历法库时应同时重新生成结构数据并运行历法测试。
