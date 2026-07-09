package com.ospreyloyalty.security;

import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

/**
 * Custom login page for the demo identity service. Replaces Spring Security's generated page so it
 * can (a) match the member/admin portals' look (the same dark "bark/feather/amber" theme and
 * Fraunces/Hanken Grotesk fonts) and (b) list the four demo users right on the form — click one to
 * fill it in. These are throwaway in-memory users, so showing the credentials is intentional here.
 */
@Controller
public class LoginController {

	@GetMapping("/login")
	@ResponseBody
	public String login(CsrfToken csrf, @RequestParam(required = false) String error,
			@RequestParam(required = false) String logout) {
		String csrfField = csrf == null ? ""
				: "<input type=\"hidden\" name=\"" + csrf.getParameterName() + "\" value=\"" + csrf.getToken() + "\">";
		String notice = "";
		if (error != null) {
			notice = "<p class=\"msg err\">Invalid username or password.</p>";
		}
		else if (logout != null) {
			notice = "<p class=\"msg ok\">You have been signed out.</p>";
		}

		return PAGE.replace("{{CSRF}}", csrfField).replace("{{NOTICE}}", notice);
	}

	private static final String PAGE = """
			<!doctype html>
			<html lang="en">
			<head>
			  <meta charset="utf-8">
			  <meta name="viewport" content="width=device-width, initial-scale=1">
			  <title>Osprey Loyalty — Sign in</title>
			  <link rel="preconnect" href="https://fonts.googleapis.com">
			  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
			  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..600;1,9..144,400&family=Hanken+Grotesk:wght@400..700&display=swap" rel="stylesheet">
			  <style>
			    :root {
			      --bark-900:#150e08; --bark-800:#1d1409; --feather-700:#2e2213; --feather-800:#241a10;
			      --feather-650:#382a17; --feather-600:#43331d; --tan-400:#c1a274; --cream-100:#efe6d3;
			      --cream-50:#f7f1e4; --amber-500:#e3ae36; --amber-600:#c8901f; --talon-950:#140d06;
			      --olive-500:#93a75c; --rust-500:#d06a39; --line-soft:rgba(255,247,232,0.06);
			      --font-display:"Fraunces",Georgia,serif; --font-ui:"Hanken Grotesk",system-ui,sans-serif;
			    }
			    * { box-sizing:border-box; }
			    body {
			      margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px;
			      font-family:var(--font-ui); color:var(--cream-100);
			      background:
			        radial-gradient(1200px 620px at 50% -12%, rgba(227,174,54,0.07), transparent 60%),
			        linear-gradient(168deg, var(--bark-800) 0%, var(--bark-900) 46%, #0f0a05 100%);
			      background-attachment:fixed;
			    }
			    .card {
			      position:relative; width:390px; max-width:100%; padding:30px 28px 26px;
			      background:linear-gradient(180deg, rgba(255,247,232,0.04), transparent 120px), var(--feather-700);
			      border:1px solid var(--line-soft); border-radius:14px;
			      box-shadow:0 18px 40px -24px rgba(0,0,0,0.85);
			    }
			    .card::before {
			      content:""; position:absolute; top:0; left:1.75rem; right:1.75rem; height:2px; border-radius:2px;
			      background:linear-gradient(90deg, transparent, var(--amber-600), transparent); opacity:0.55;
			    }
			    .brand { display:flex; align-items:center; gap:12px; margin-bottom:22px; }
			    .brand .badge {
			      width:44px; height:44px; flex:0 0 44px; border-radius:12px; display:grid; place-items:center;
			      background:radial-gradient(circle at 35% 30%, var(--cream-50), var(--cream-100));
			      box-shadow:0 0 0 1px var(--line-soft), 0 6px 16px -8px rgba(0,0,0,0.7);
			    }
			    .brand .eyebrow {
			      font-size:0.66rem; text-transform:uppercase; letter-spacing:0.18em; font-weight:700; color:var(--amber-500);
			    }
			    .brand h1 { margin:2px 0 0; font-family:var(--font-display); font-weight:540; font-size:1.5rem; color:var(--cream-50); }
			    .brand h1 em { font-style:italic; color:var(--tan-400); font-weight:400; }
			    label { display:block; margin:14px 0 5px; font-size:0.66rem; text-transform:uppercase; letter-spacing:0.14em; color:var(--tan-400); font-weight:700; }
			    input {
			      width:100%; padding:11px 12px; font-size:15px; color:var(--cream-50);
			      background:var(--feather-800); border:1px solid var(--line-soft); border-radius:8px;
			    }
			    input::placeholder { color:#7c6f58; }
			    input:focus { outline:none; border-color:var(--amber-600); box-shadow:0 0 0 3px rgba(227,174,54,0.18); }
			    button.primary {
			      width:100%; margin-top:20px; padding:12px; border:0; border-radius:8px; cursor:pointer;
			      font:inherit; font-weight:700; color:var(--talon-950);
			      background:linear-gradient(180deg, var(--amber-500), var(--amber-600));
			      box-shadow:0 0 18px -6px rgba(227,174,54,0.6);
			    }
			    button.primary:hover { filter:brightness(1.05); }
			    .demo { margin-top:24px; border-top:1px dashed var(--line-soft); padding-top:16px; }
			    .demo h2 { margin:0 0 10px; font-size:0.66rem; text-transform:uppercase; letter-spacing:0.14em; color:var(--tan-400); font-weight:700; }
			    .demo button {
			      display:flex; width:100%; justify-content:space-between; align-items:center; gap:10px;
			      padding:9px 12px; margin-bottom:7px; cursor:pointer; font:inherit; color:var(--cream-100);
			      background:var(--feather-650); border:1px solid var(--line-soft); border-radius:9px;
			    }
			    .demo button:hover { border-color:var(--amber-600); background:var(--feather-600); }
			    .demo .u { font-weight:600; font-variant-numeric:tabular-nums; }
			    .demo .r {
			      font-size:0.6rem; text-transform:uppercase; letter-spacing:0.12em; font-weight:700;
			      padding:2px 8px; border-radius:999px; color:var(--talon-950);
			      background:linear-gradient(180deg, var(--amber-500), var(--amber-600));
			    }
			    .demo .r.member { background:none; color:var(--tan-400); padding:0; letter-spacing:0.14em; }
			    .msg { margin:0 0 14px; padding:9px 11px; border-radius:8px; font-size:13px; border:1px solid transparent; }
			    .msg.err { background:rgba(208,106,57,0.14); border-color:rgba(208,106,57,0.4); color:#f0b79c; }
			    .msg.ok { background:rgba(147,167,92,0.14); border-color:rgba(147,167,92,0.4); color:#c7d79f; }
			    .hint { margin:14px 0 0; font-size:12px; color:#7c6f58; text-align:center; }
			  </style>
			</head>
			<body>
			  <main class="card">
			    <div class="brand">
			      <span class="badge">
			        <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
			          <path d="M4.5 15.5c0-6 4.8-10.5 11-10.5 3.8 0 6.8 1.7 8.8 3.9l4.4 1.3-3.3 2.2c-.1 7-5 11.9-11 11.9-6 0-9.9-4.5-9.9-8.8Z" fill="#2e2213" stroke="#43331d" stroke-width="1"/>
			          <path d="M6.5 12.4h12.5" stroke="#140d06" stroke-width="2.6" stroke-linecap="round" opacity=".85"/>
			          <circle cx="12.6" cy="14.8" r="3.3" fill="#e3ae36"/>
			          <circle cx="12.6" cy="14.8" r="1.35" fill="#140d06"/>
			          <path d="M24.4 12.2l5.2 1.9-4.3 2.1" fill="#efe6d3"/>
			        </svg>
			      </span>
			      <div>
			        <div class="eyebrow">Osprey Loyalty</div>
			        <h1>Sign <em>in</em></h1>
			      </div>
			    </div>
			    {{NOTICE}}
			    <form method="post" action="/login">
			      {{CSRF}}
			      <label for="username">Username</label>
			      <input id="username" name="username" placeholder="demo-ada" autocomplete="username" autofocus>
			      <label for="password">Password</label>
			      <input id="password" name="password" type="password" placeholder="••••••••" autocomplete="current-password">
			      <button class="primary" type="submit">Sign in</button>
			    </form>
			    <section class="demo">
			      <h2>Demo users — click to fill</h2>
			      <button type="button" onclick="fill('demo-ada','password')"><span class="u">demo-ada</span><span class="r member">Member</span></button>
			      <button type="button" onclick="fill('demo-erik','password')"><span class="u">demo-erik</span><span class="r member">Member</span></button>
			      <button type="button" onclick="fill('demo-yusra','password')"><span class="u">demo-yusra</span><span class="r member">Member</span></button>
			      <button type="button" onclick="fill('admin','admin')"><span class="u">admin</span><span class="r">Admin</span></button>
			    </section>
			    <p class="hint">Demo identity service · in-memory users</p>
			  </main>
			  <script>
			    function fill(u, p) {
			      document.getElementById('username').value = u;
			      document.getElementById('password').value = p;
			      document.getElementById('password').focus();
			    }
			  </script>
			</body>
			</html>
			""";
}
