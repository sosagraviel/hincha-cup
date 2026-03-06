<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
    <!DOCTYPE html>
    <html class="${properties.kcHtmlClass!}">

    <head>
        <meta charset="utf-8">
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="robots" content="noindex, nofollow">
        <#if properties.meta?has_content>
            <#list properties.meta?split(' ') as meta>
            <meta name="${meta?split('==')[0]}" content="${meta?split('==')[1]}"/>
        </#list>
    </#if>
    <title>
${msg("loginTitle",(realm.displayName!''))}
</title>
    <link rel="icon" href="${url.resourcesPath}/img/favicon.ico" />
    <#if properties.stylesCommon?has_content>
        <#list properties.stylesCommon?split(' ') as style>
            <link href="${url.resourcesCommonPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <script type="text/javascript">
        function setThemeMode() {
            const urlParams = new URLSearchParams(window.location.search);
            const themeMode = urlParams.get(' theme');
                const html=document.documentElement;
                // Remove any existing theme classes
                html.classList.remove('theme-light', 'theme-dark' );
                // Add the appropriate theme class
                if (themeMode==='light' ) {
                html.classList.add('theme-light');
                } else if (themeMode==='dark' ) {
                html.classList.add('theme-dark');
                }
                }
                window.onload=setThemeMode;
                </script>
                <!-- Load font awesome -->
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    </head>

    <body>
        <div class="login-pf-page">
            <div id="kc-header" class="login-pf-page-header">
                <div id="kc-header-wrapper">
                    ${kcSanitize(msg("loginTitleHtml",(realm.displayNameHtml!'')))?no_esc}
                </div>
            </div>
            <div class="card-pf">
                <img src="${url.resourcesPath}/img/main_logo_svg.svg" alt="Logo" class="logo" />
                <div id="kc-content">
                    <div id="kc-content-wrapper">
                        <#nested "form">
                    </div>
                </div>
                <div class="copyright">
                    © ${.now?string('yyyy')} - Liveonit
                </div>
            </div>
    </body>

    </html>
</#macro>