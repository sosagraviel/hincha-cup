<#-- mini-monorepo custom login theme — single FreeMarker template stub. -->
<!DOCTYPE html>
<html>
  <head><title>${msg("loginTitle")}</title></head>
  <body>
    <h1>mini-monorepo</h1>
    <form action="${url.loginAction}" method="post">
      <input name="username" placeholder="${msg('username')}" />
      <input name="password" type="password" placeholder="${msg('password')}" />
      <button>${msg("doLogIn")}</button>
    </form>
  </body>
</html>
