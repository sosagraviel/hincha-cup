<#import "template.ftl" as layout>
<@layout.emailLayout>
    <table style="padding: 35px 60px; width: 100%;" cellpadding="0" cellspacing="0" border="0">
        <tr>
            <td>
                <h1 style="margin-top: 0;margin-bottom: 24px; font-size: 1.875rem;  color: #1a1a1a;">${msg("greeting", user.firstName)}</h1>
            </td>
        </tr>
        <tr>
            <td style="padding-bottom: 20px;">
                <p style="font-size: 1rem; margin: 0;  color: #1a1a1a;">
                    ${kcSanitize(msg("passwordResetBodyHtml", realmName))?no_esc}
                </p>
            </td>
        </tr>
        <tr>
            <td style="padding-bottom: 20px;">
                <p style="font-size: 1rem; margin: 0; color: #1a1a1a;">
                    ${msg("createNewPasswordInstruction")}
                </p>
            </td>
        </tr>
        <tr>
            <td style="padding-top: 30px; padding-bottom: 50px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0"> 
                    <tr>
                        <td align="center">
                            <a href="${link}" style="padding: 14px 16px; margin: 8px 0; border-radius: 8px; font-size: 14px; cursor: pointer; text-decoration: none; text-align: center; border: none; background-color: #001352; color: #ffffff; font-family: Inter, Arial, sans-serif;">
                                ${msg("createNewPassword")}
                            </a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td style="padding-bottom: 25px;">
                <p  style="font-size: 0.75rem; margin: 0; color: #1a1a1a;">
                    ${kcSanitize(msg("contactUsHtml", "gira@gira.ai", "gira@gira.ai"))?no_esc}
                </p>
            </td>
        </tr>
        <tr>
            <td>
                <p style="font-size: 0.75rem; margin: 0; color: #1a1a1a;">
                    ${msg("ignoreEmailHtml")}
                </p>
            </td>
        </tr>
    </table>
</@layout.emailLayout>
