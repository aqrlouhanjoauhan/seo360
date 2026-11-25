/**
 * codegen.js
 * 多语言 API 调用代码生成模块（MCP / cURL / Python / Node.js / PHP / Go / Java）
 */
(function (global) {
  'use strict';

  let currentLang = 'mcp';
  let includeCredentials = false;

  function setLanguage(lang) {
    currentLang = lang || 'curl';
  }

  function getLanguage() {
    return currentLang;
  }

  function toggleCredentials() {
    includeCredentials = !includeCredentials;
    return includeCredentials;
  }

  function isCredentialsIncluded() {
    return includeCredentials;
  }

  // 生成并刷新代码预览区
  async function refreshCodeOutput() {
    const effectivePath =
      typeof global.getEffectiveApiPath === 'function' ? global.getEffectiveApiPath() : '';
    const apiRoot = global.Seo360Api?.DATAFORSEO_API_ROOT || 'https://api.dataforseo.com/v3/';
    const endpoint = `${apiRoot}${effectivePath}`;

    const payload =
      typeof global.Seo360Params?.extractPayload === 'function'
        ? global.Seo360Params.extractPayload()
        : [{}];
    const payloadJson = JSON.stringify(payload, null, 2);

    let loginVal = 'YOUR_LOGIN';
    let passVal = 'YOUR_PASSWORD';

    if (includeCredentials && global.Seo360Api?.getStoredCredentials) {
      const creds = await global.Seo360Api.getStoredCredentials();
      if (creds.api_login) loginVal = creds.api_login;
      if (creds.api_password) passVal = creds.api_password;
    }

    let snippet = '';

    if (currentLang === 'mcp') {
      snippet = JSON.stringify(
        {
          mcpServers: {
            'seo360-mcp': {
              command: 'npx',
              args: ['-y', 'seo360-mcp'],
              env: {
                DATAFORSEO_LOGIN: loginVal,
                DATAFORSEO_PASSWORD: passVal
              }
            }
          }
        },
        null,
        2
      );
    } else if (currentLang === 'curl') {
      snippet = `YOUR_LOGIN="${loginVal}"
YOUR_PASSWORD="${passVal}"

curl --location --request POST '${endpoint}' \\
--user "$YOUR_LOGIN:$YOUR_PASSWORD" \\
--header 'Content-Type: application/json' \\
--data-raw '${JSON.stringify(payload)}'`;
    } else if (currentLang === 'python') {
      snippet = `YOUR_LOGIN = "${loginVal}"
YOUR_PASSWORD = "${passVal}"

import requests

url = "${endpoint}"
payload = ${JSON.stringify(payload, null, 4)}

response = requests.post(url, json=payload, auth=(YOUR_LOGIN, YOUR_PASSWORD))
print(response.json())`;
    } else if (currentLang === 'nodejs') {
      snippet = `const YOUR_LOGIN = '${loginVal}';
const YOUR_PASSWORD = '${passVal}';

const auth = Buffer.from(\`\${YOUR_LOGIN}:\${YOUR_PASSWORD}\`).toString('base64');

const response = await fetch('${endpoint}', {
  method: 'POST',
  headers: {
    'Authorization': 'Basic ' + auth,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(${payloadJson})
});

const data = await response.json();
console.log(data);`;
    } else if (currentLang === 'php') {
      snippet = `<?php
$YOUR_LOGIN = "${loginVal}";
$YOUR_PASSWORD = "${passVal}";

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "${endpoint}");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_USERPWD, "$YOUR_LOGIN:$YOUR_PASSWORD");
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_POSTFIELDS, '${JSON.stringify(payload)}');

$response = curl_exec($ch);
curl_close($ch);
echo $response;
?>`;
    } else if (currentLang === 'go') {
      snippet = `package main

import (
\t"bytes"
\t"encoding/base64"
\t"fmt"
\t"io"
\t"net/http"
)

const YOUR_LOGIN = "${loginVal}"
const YOUR_PASSWORD = "${passVal}"

func main() {
\turl := "${endpoint}"
\tpayload := []byte(\`${JSON.stringify(payload)}\`)

\treq, _ := http.NewRequest("POST", url, bytes.NewBuffer(payload))
\treq.Header.Set("Content-Type", "application/json")
\tauth := base64.StdEncoding.EncodeToString([]byte(YOUR_LOGIN + ":" + YOUR_PASSWORD))
\treq.Header.Set("Authorization", "Basic " + auth)

\tclient := &http.Client{}
\tresp, err := client.Do(req)
\tif err != nil {
\t\tpanic(err)
\t}
\tdefer resp.Body.Close()
\tbody, _ := io.ReadAll(resp.Body)
\tfmt.Println(string(body))
}`;
    } else if (currentLang === 'java') {
      snippet = `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Base64;

public class DataForSeoClient {
    public static final String YOUR_LOGIN = "${loginVal}";
    public static final String YOUR_PASSWORD = "${passVal}";

    public static void main(String[] args) throws Exception {
        String url = "${endpoint}";
        String payload = "${JSON.stringify(payload).replace(/"/g, '\\"')}";
        String auth = Base64.getEncoder().encodeToString((YOUR_LOGIN + ":" + YOUR_PASSWORD).getBytes());

        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .header("Authorization", "Basic " + auth)
                .POST(HttpRequest.BodyPublishers.ofString(payload))
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println(response.body());
    }
}`;
    }

    const snippetEl = document.getElementById('code-snippet');
    if (snippetEl) {
      snippetEl.textContent = snippet;
    }
  }

  global.Seo360Codegen = {
    setLanguage,
    getLanguage,
    toggleCredentials,
    isCredentialsIncluded,
    refreshCodeOutput
  };

  // 挂载全局快捷方法供 params.js 回调
  global.refreshCodeOutput = refreshCodeOutput;
})(window);