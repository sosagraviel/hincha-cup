<#import "template.ftl" as layout>
    <@layout.registrationLayout displayMessage=!messagesPerField.existsError('username'); section>
        <div class="password-recovery-container">
            <h1>
                ${msg("passwordRecoveryTitle")}
            </h1>
            <p>
                ${msg("passwordRecoverySubTitle")}
            </p>
            <form id="kc-reset-password-form" class="form" action="${url.loginAction}" method="post">
                <div class="form-group">
                    <label for="username">
                        <span class="required">*</span>
                        ${msg("email")}
                    </label>
                    <input id="username"
                        name="username"
                        type="text"
                        class="form-control"
                        autocomplete="email"
                        placeholder="user@email.com"
                        autofocus
                        aria-invalid="<#if messagesPerField.existsError('username')>true</#if>" />
                    <#if messagesPerField.existsError('username')>
                        <label class="info-message error-message" for="username">
                            ${kcSanitize(messagesPerField.get('username'))?no_esc}
                        </label>
                    </#if>
                </div>
                <div class="form-group">
                    <button type="submit" class="btn" id="submitButton">
                        ${msg("doSend")}
                    </button>
                </div>
            </form>
            <div class="return-to-login-link">
                <a href="${url.loginUrl}">
                    ${msg("backToLogin")}
                </a>
            </div>
        </div>
        <script type="text/javascript">
        document.getElementById('kc-reset-password-form').addEventListener('submit', function(e) {
            const submitButton = document.getElementById('submitButton');
            submitButton.disabled = true;
        });
        </script>
    </@layout.registrationLayout>