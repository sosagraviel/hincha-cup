<#import "template.ftl" as layout>
    <@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>
        <div class="login-container">
            <h1 class="header-title">Welcome!</h1>
            <#if section="form">
                <div id="kc-form">
                    <div id="kc-form-wrapper">
                        <form id="kc-form-login" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
                            <#-- Username input -->
                                <div class="form-group">
                                    <label for="username"">
                                <span class=" required">*</span>
                                        ${msg('usernameLabel')}
                                    </label>
                                    <input tabindex=" 1" id="username" class="form-control" name="username" value="${(login.username!'')}"
                                        type="text" autofocus autocomplete="off" placeholder="${msg('username')}"
                                        aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>" />
                                </div>
                                <#-- Password input -->
                                    <div class="form-group form-group-password">
                                        <label for="password" id="password-label">
                                        <span class=" required">*</span>
                                            ${msg('passwordLabel')}
                                        </label>
                                        <div class="password-input-container">
                                            <input tabindex="2" id="password" class="form-control" name="password" type="password"
                                                autocomplete="off" placeholder="${msg('password')}"
                                                aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>" />
                                            <button type="button" class="password-visibility-toggle" onclick="togglePassword()">
                                                <i class="fa fa-eye"></i>
                                            </button>
                                        </div>
                                        <!-- Authentication Error Message -->
                                        <#if message?has_content>
                                            <span id="input-error-password" class="error-message" aria-live="polite">
                                                <#if message?has_content && message.type='error'>
                                                    ${kcSanitize(message.summary)?no_esc}
                                                </#if>
                                            </span>
                                        </#if>
                                    </div>
                                    <#-- Remember me checkbox -->
                                        <div class="form-group">
                                            <div id="kc-form-options">
                                                <#if realm.rememberMe && !usernameEditDisabled??>
                                                    <div class="checkbox">
                                                        <label>
                                                            <#if login.rememberMe??>
                                                                <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox" checked>
                                                                ${msg("rememberMe")}
                                                                <#else>
                                                                    <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox">
                                                                    ${msg("rememberMe")}
                                                            </#if>
                                                        </label>
                                                    </div>
                                                </#if>
                                            </div>
                                        </div>
                                        <div id="kc-form-buttons" class="form-group">
                                            <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"
            </#if>/>
            <#-- Login button -->
                <input tabindex="4" class="btn btn-primary btn-block btn-lg btn-disabled" name="login" id="kc-login" type="submit" value="${msg("doLogIn")}" disabled />
        </div>
        </form>
        <#if realm.password && social.providers??>
            <div class="separator">
                <span>
                    ${msg('or')}
                </span>
            </div>
            <div id="kc-social-providers" class="social-providers">
                <#list social.providers as p>
                    <a href="${p.loginUrl}" class="social-provider-btn">
                        ${p.displayName!}
                    </a>
                </#list>
            </div>
        </#if>
        </div>
        </div>
        </#if>
        <#if realm.resetPasswordAllowed>
            <div class="form-options-right">
                <a href="${url.loginResetCredentialsUrl}" class="forgot-password-link">
                    ${msg("forgotPassword")}
                </a>
            </div>
        </#if>
        <div class="login-contact-us">
            <p>Do you need help? Contact us for</p>
            <p><a href="mailto:${msg("supportEmail")}">
                    ${msg("supportEmail")}
                </a></p>
        </div>
        </div>
    </@layout.registrationLayout>
    <style>
    .btn-disabled {
        background-color: #d6d6d6 !important;
        border-color: #d6d6d6 !important;
        color: #999999 !important;
        opacity: 1;
        cursor: not-allowed;
    }

    .btn-disabled:hover {
        background-color: #d6d6d6 !important;
        border-color: #d6d6d6 !important;
        color: #999999 !important;
    }
    </style>
    <script type="text/javascript">
    function togglePassword() {
        var x = document.getElementById("password");
        var icon = document.querySelector(".password-visibility-toggle i");
        if (x.type === "password") {
            x.type = "text";
            icon.className = "fa fa-eye-slash";
        } else {
            x.type = "password";
            icon.className = "fa fa-eye";
        }
    }

    function validateForm() {
        var username = document.getElementById("username").value.trim();
        var password = document.getElementById("password").value.trim();
        var loginButton = document.getElementById("kc-login");
        if (username !== "" && password !== "") {
            loginButton.disabled = false;
            loginButton.classList.remove("btn-disabled");
        } else {
            loginButton.disabled = true;
            loginButton.classList.add("btn-disabled");
        }
    }
    function checkTemporaryPassword() {
        var url = window.location.href;
        var urlParams = new URLSearchParams(window.location.search);
        
        var isTemporary = 
            urlParams.get("temp") === "true"
                         
        if (isTemporary) {
            var passwordLabel = document.getElementById("password-label");
            var passwordInput = document.getElementById("password");
            if (passwordLabel) {
                passwordLabel.innerHTML = '<span class=" required">*</span> ${msg('temporaryPasswordLabel')?js_string}';
            }
            if (passwordInput) {
                passwordInput.placeholder = '${msg('temporaryPassword')?js_string}';
            }
        }
    }

    // Add event listeners when the page loads
    document.addEventListener("DOMContentLoaded", function() {
        var usernameInput = document.getElementById("username");
        var passwordInput = document.getElementById("password");
        usernameInput.addEventListener("input", validateForm);
        passwordInput.addEventListener("input", validateForm);
        // Initial validation
        validateForm();
        // Check for temporary password scenario
        checkTemporaryPassword();
    });
    </script>