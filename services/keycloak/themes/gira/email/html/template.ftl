<#macro emailLayout>
    <html lang="${locale.language}">
    <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    </head>
        <body style="background-color: #fafafa;">
            <table style="max-width: 490px; margin: 0 auto; background-color: #ffffff; text-align: center; font-family: Inter, Arial, sans-serif;" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                    <td style=" border-bottom: 1px solid #e0e0e0;align-items: center;padding: 30px 0;" align="center">
                        <img src="${url.resourcesUrl}/img/main_logo.png" alt="Logo" style="width: 190px; height: auto;" />
                    </td>
                </tr>
                <tr>
                    <td>
                        <#nested>
                    </td>
                </tr>
            </table>
        </body>
    </html>
</#macro>