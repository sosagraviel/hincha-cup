<#import "template.ftl" as layout>
    <@layout.registrationLayout displayInfo=true; section>
        <div class="configure-mfa-container">
            <div class="configure-mfa-header">
                <img src="${url.resourcesPath}/img/shield_icon_svg.svg" alt="Shield image" class="shield-icon" />
                <h1>Configure MFA</h1>
                <p>
                    Protect your account with two-factor authentication
                </p>
            </div>
            <#if section="title">
                ${msg("loginTotpTitle")}
                <#elseif section="header">
                    ${msg("loginTotpTitle")}
                    <#elseif section="form">
                        <ol id="kc-totp-settings">
                            <div class="column">
                                <#-- Step 1 -->
                                    <li>
                                        <p>
                                            <span class="step-title">Download an install authentication application</span></br>
                                            Like Google Authenticator, Microsoft</br>
                                            Authenticator or Free OTP</br>
                                        </p>
                                    </li>
                                    <#-- Step 2 -->
                                        <li>
                                            <p>
                                                <span class="step-title">Scan the QR code</span></br>
                                                Use the application to scan the following code
                                            </p>
                                            <img class="qr-code" src="data:image/png;base64, ${totp.totpSecretQrCode}" alt="Figure: Barcode"><br />
                                            <p>or use the code:</p>
                                            <div class="code-container">
                                                <p class="code" onclick="copyToClipboard(this)">
                                                    ${totp.totpSecretEncoded}
                                                </p>
                                                <span class="copy-tooltip">Click to copy</span>
                                            </div>
                                        </li>
                            </div>
                            <div class="column">
                                <#-- Step 3 -->
                                    <li>
                                        <p>
                                            <span class="step-title">Enter the verification code</span></br>
                                            Enter the one-time code provided by the application and click Submit to finish the setup.
                                        </p>
                                        <form action="${url.loginAction}" class="form config-totp ${properties.kcFormClass!}" id="kc-totp-settings-form" method="post">
                                            <div class="form-group">
                                                <label for="totp"">
                                                    <span class=" required">*</span>
                                                    One-time code
                                                </label>
                                                <input type="text" id="totp" name="totp" autocomplete="off" class="form-control ${properties.kcInputClass!}" />
                                                <input type="hidden" id="totpSecret" name="totpSecret" value="${totp.totpSecret}" />
                                                <input type="hidden" id="signOutOtherDevices" name="signOutOtherDevices" value="false" />
                                                <#if message?has_content && (message.type='error' )>
                                                    <label class="error-message" for="totp">
                                                        ${kcSanitize(message.summary)?no_esc}
                                                    </label>
                                                    <#else>
                                                        <label class="info-message" for="totp">
                                                            Enter the 6-digit code of your authentication application
                                                        </label>
                                                </#if>
                                            </div>
                                            <div class=" form-group">
                                                <div id="kc-form-options">
                                                    <div class="checkbox">
                                                        <label>
                                                            <input id="signOutOtherDevicesCheckbox" type="checkbox" onchange="document.getElementById('signOutOtherDevices').value = this.checked">
                                                            Sign out from other devices
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="">
                                                <div class="">
                                                    <button class="btn image-button" type="submit" id="submitButton">
                                                        <img src="${url.resourcesPath}/img/check_circle_icon_svg.svg" alt="circle check icon" class="check-circle-icon" />
                                                        <span class="button-text">Verify</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </form>
                                    </li>
                            </div>
                        </ol>
            </#if>
        </div>
        <script>
        async function copyToClipboard(element) {
            const code = element.textContent.trim();
            try {
                await navigator.clipboard.writeText(code);
                const tooltip = element.querySelector('.copy-tooltip');
                tooltip.textContent = 'Copied!';
                setTimeout(() => {
                    tooltip.textContent = 'Click to copy';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy code: ', err);
            }
        }
        // Handle form submission
        document.getElementById('kc-totp-settings-form').addEventListener('submit', function(e) {
            const submitButton = document.getElementById('submitButton');
            const buttonText = submitButton.querySelector('.button-text');
            // Disable the button and update text
            submitButton.disabled = true;
            buttonText.textContent = 'Verifying';
        });
        </script>
    </@layout.registrationLayout>