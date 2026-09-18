# 台灣圍棋名錄查詢

密碼保護的靜態查詢網站，資料來自中華民國圍棋協會公開名錄（**本站非官方**）。

## 使用方式

1. 開啟 GitHub Pages 網站：<https://coojiin.github.io/weiqi-roster/>
2. 向網站管理員索取存取密碼
3. 輸入密碼解鎖後，可依姓名、段位／組別、出生年篩選查詢

> 出生年為 **1900** 時，通常表示原始資料未提供正確出生年（未知）。

## 技術說明

- 純靜態站（HTML / CSS / JS），適合 GitHub Pages
- 名錄以 **PBKDF2-SHA256 + AES-GCM** 於建置時加密；瀏覽器端以 Web Crypto 解密
- **不會**將明文名錄或密碼提交至本儲存庫

## 重新加密資料（維護者）

明文 JSON 請放在儲存庫外（例如本機其他目錄），勿加入 git。

```bash
# 需安裝 cryptography（可用既有 venv）
export WEIQI_ROSTER_PASSWORD='（向管理員取得之密碼）'
python scripts/encrypt_roster.py \
  --input /path/to/roster_all.json \
  --output data/roster.enc.json
```

或：

```bash
python scripts/encrypt_roster.py -i /path/to/roster_all.json -p '（密碼）'
```

然後提交更新後的 `data/roster.enc.json`。

## 授權與免責

資料來源為中華民國圍棋協會公開名錄；本站非官方，僅供查詢參考。
