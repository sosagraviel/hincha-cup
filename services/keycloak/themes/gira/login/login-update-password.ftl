<#import "template.ftl" as layout>
    <@layout.registrationLayout displayMessage=!messagesPerField.existsError('password-new','password-confirm'); section>
        <div class="update-password-container">
            <div class="update-password-header ">
                <h1>
                    ${msg("resetPasswordTitle")}
                </h1>
                <p>
                    ${msg("resetPasswordSubTitle")}
                </p>
            </div>
            <#if section="form">
                <div id="kc-form">
                    <div id="kc-form-wrapper">
                        <form id="kc-passwd-update-form" class="form" action="${url.loginAction}" method="post">
                            <input type="text" id="username" name="username" value="${username}" autocomplete="username" readonly style="display:none;" />
                            <div class="form-group form-group-password">
                                <label for="password-new">
                                    <span class="required">*</span>
                                    New password
                                </label>
                                <div class="password-input-container">
                                    <input type="password" id="password-new" name="password-new" class="form-control" autofocus autocomplete="new-password"
                                        aria-invalid="<#if messagesPerField.existsError('password-new')>true</#if>"
                                        placeholder="${msg('resetPasswordPlaceholder')}" />
                                    <button type="button" class="password-visibility-toggle" onclick="togglePassword('password-new')">
                                        <i class="fa fa-eye"></i>
                                    </button>
                                </div>
                                <#if messagesPerField.existsError('password-new')>
                                    <span id="input-error-password-new" class="error-message" aria-live="polite">
                                        ${kcSanitize(messagesPerField.get('password-new'))?no_esc}
                                    </span>
                                </#if>
                            </div>
                            <div class="form-group form-group-password">
                                <label for="password-confirm">
                                    <span class="required">*</span>
                                    ${msg("resetPasswordConfirm")}
                                </label>
                                <div class="password-input-container">
                                    <input type="password" id="password-confirm" name="password-confirm" class="form-control" autocomplete="new-password"
                                        aria-invalid="<#if messagesPerField.existsError('password-confirm')>true</#if>"
                                        placeholder="${msg('resetPasswordConfirmPlaceholder')}" />
                                    <button type="button" class="password-visibility-toggle" onclick="togglePassword('password-confirm')">
                                        <i class="fa fa-eye"></i>
                                    </button>
                                </div>
                                <#if messagesPerField.existsError('password-confirm')>
                                    <span id="input-error-password-confirm" class="error-message" aria-live="polite">
                                        ${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}
                                    </span>
                                </#if>
                            </div>
                            <div class="form-group">
                                <div id="kc-form-buttons">
                                    <button type="submit" class="btn" id="submitButton">
                                        ${msg("resetPasswordConfirm")}
                                    </button>
                                </div>
                            </div>
                        </form>
                        <div class="login-contact-us">
                            <p>Do you need help? Contact us for</p>
                            <p><a href="mailto:${msg("supportEmail")}">
                                    ${msg("supportEmail")}
                                </a></p>
                        </div>
                    </div>
                </div>
            </#if>
        </div>
        <script type="text/javascript">
        function togglePassword(inputId) {
            var x = document.getElementById(inputId);
            var icon = x.parentElement.querySelector(".password-visibility-toggle i");
            if (x.type === "password") {
                x.type = "text";
                icon.className = "fa fa-eye-slash";
            } else {
                x.type = "password";
                icon.className = "fa fa-eye";
            }
        }
        // Handle form submission
        document.getElementById('kc-passwd-update-form').addEventListener('submit', function(e) {
            const submitButton = document.getElementById('submitButton');
            submitButton.disabled = true;
        });
        </script>
    </@layout.registrationLayout>