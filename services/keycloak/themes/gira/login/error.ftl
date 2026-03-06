<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
    <div class="error-container">
        <div class="error-icon">
            <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h1 class="error-title">
            ${msg("errorTitle")}
        </h1>
        <p class="error-message">
            ${msg("errorMessage")}
        </p>
        <div class="login-contact-us">
            <p>Do you need help? Contact us for</p>
            <p><a href="mailto:${msg("supportEmail")}">
                    ${msg("supportEmail")}
                </a></p>
        </div>
    </div>
</@layout.registrationLayout>