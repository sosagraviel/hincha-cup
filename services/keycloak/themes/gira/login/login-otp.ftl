<#import "template.ftl" as layout>
    <@layout.registrationLayout displayMessage=!messagesPerField.existsError('totp'); section>
        <div class="otp-container">
            <div class="otp-header">
                <img src="${url.resourcesPath}/img/shield_icon_svg.svg" alt="Shield icon" class="shield-icon" />
                <h1>Verify Code</h1>
                <p class="otp-instructions">
                    Enter the code of your authentication application
                </p>
            </div>
            <form id="kc-otp-login-form" class="form" action="${url.loginAction}" method="post">
                <div class="form-group">
                    <label for="otp">
                        <span class="required">*</span>
                        One-time code
                    </label>
                    <input id="otp"
                        name="otp"
                        type="text"
                        class="form-control"
                        autocomplete="off"
                        placeholder="Enter the code"
                        autofocus
                        maxlength="6"
                        aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>"
                        pattern="\d{6}" />
                    <label class="info-message <#if messagesPerField.existsError('totp')>error-message</#if>" for="otp">
                        <#if messagesPerField.existsError('totp')>
                            ${kcSanitize(messagesPerField.get('totp'))?no_esc}
                            <#else>
                                Enter the 6-digit code of your authentication application
                        </#if>
                    </label>
                </div>
                <div class="form-group">
                    <button type="submit" class="btn image-button" id="submitButton" disabled>
                        <img src="${url.resourcesPath}/img/check_circle_icon_svg.svg" alt="circle check icon" class="check-circle-icon" />
                        <span class="button-text">Verify</span>
                    </button>
                </div>
            </form>
            <#if authenticatorConfigured?has_content>
                <div class="recovery-link">
                    <a href="${url.loginAction}?authenticationExecution=${execution}&recovery=true">
                        ${msg("loginRecoveryCodePrompt", "Use Recovery Code")}
                    </a>
                </div>
            </#if>
        </div>
        <script type="text/javascript">
        const submitButton = document.getElementById('submitButton');
        // Handle form submission
        document.getElementById('kc-otp-login-form').addEventListener('submit', (e) => {
            const buttonText = submitButton.querySelector('.button-text');
            submitButton.disabled = true;
            buttonText.textContent = 'Verifying';
        });
        // Auto-format the OTP input to only allow numbers
        document.getElementById('otp').addEventListener('input', (e) => {
            const numbersOnly = /\D/g;
            e.target.value = e.target.value.replace(numbersOnly, '');
            // Disable if empty OR not exactly 6 digits
            submitButton.disabled = e.target.value.length !== 6;
        });
        </script>
    </@layout.registrationLayout>