# ตัวแจ้งเตือนหัวข้อ Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **ไทย** |
| :-------------------------: | :-----: |

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

เพิ่มหัวข้อ Heybox ในการตั้งค่า เลือกคำสำคัญ นิพจน์ปรกติ หรือตัวกรอง AI แล้วเปิดการตรวจสอบเป็นระยะ ย้ายโพสต์ที่ตรงเงื่อนไขไปยังประวัติและนำกลับมายังพื้นที่ทำงานได้

การสมัครบัญชีต้องใช้รหัสเชิญ การแจ้งเตือนของแอปเปิดแยกตามอุปกรณ์และใช้ร่วมกับอีเมลหรือ Webhook ได้ การแก้ไขขณะออฟไลน์จะซิงค์เมื่อเชื่อมต่ออีกครั้ง ภาษาและโหมดมืดใช้ค่าของอุปกรณ์เป็นค่าเริ่มต้น

## คุณสมบัติ

- แดชบอร์ด: ดูสถานะการตรวจสอบ จำนวนรายการที่ตรงกันทั้งหมด รายการที่ตรงกันล่าสุด และรายการที่รอดำเนินการ
  พร้อมการตรวจสอบด้วยตนเอง
- หน้าการตั้งค่า: กำหนด ID หัวข้อ สถานะการเปิดใช้งาน หมายเหตุ หน่วยช่วงเวลาการตรวจสอบ จำนวนโพสต์สูงสุด
  โหมดการเรียงลำดับ ภาษา UI โหมดมืด และสีธีม
- การตั้งค่าบัญชี: สมัครสมาชิก เข้าสู่ระบบ ออกจากระบบ อัปเดตชื่อผู้ใช้ และอัปเดตรหัสผ่าน;
  ข้อมูลบัญชีถูกแยกตาม ID ผู้ใช้
- กฎคำสำคัญ: รองรับกฎที่ใช้ร่วมกัน กฎเฉพาะหัวข้อ ตำแหน่งการจับคู่ การแยกแยะตัวพิมพ์เล็ก/ใหญ่
  และนิพจน์ทั่วไป
- ตั้งค่า → การตั้งค่าการแจ้งเตือน → ทดสอบการแจ้งเตือน
- ช่องทางการแจ้งเตือน: Webhook แบบกำหนดเอง, ServerChan, PushPlus, WxPusher, email API และ SMTP
- รีเลย์การแจ้งเตือน: รีเลย์ Cloudflare Worker แบบเลือกใช้ได้สำหรับ PushPlus, WxPusher และ ServerChan

## การพัฒนาในเครื่อง

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## การ Deploy

บริการ Deno ทำงานบน Oracle Cloud โดยใช้ Caddy สำหรับ HTTPS บัญชี เซสชัน และผลลัพธ์จัดเก็บใน Turso ส่วน GitHub Actions สร้างตัวติดตั้ง Windows และ Android จากแท็กเผยแพร่

[ติดตั้งบนเซิร์ฟเวอร์ของตนเอง](./deployment.md) · [Cloudflare Worker](./worker.md)

## ใบอนุญาต

โปรเจกต์นี้ได้รับอนุญาตภายใต้ [GNU Affero General Public License v3.0](../../LICENSE)
