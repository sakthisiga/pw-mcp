pipeline {
    agent any

    environment {
        PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.56.0-jammy'
    }

    stages {

        stage('Cleanup Workspace') {
            steps {
                script {
                    echo 'Cleaning workspace before checkout...'
                    cleanWs()
                    echo 'Workspace cleaned successfully'
                }
            }
        }

        stage('Checkout') {
            steps {
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: GIT_BRANCH]],
                    userRemoteConfigs: [[
                        url: 'git@github.com:sakthisiga/pw-mcp.git'
                    ]]
                ])
            }
        }

        stage('Set Environment Variables') {
            steps {
                script {
                    def abisUrl = ''
                    def abisUsername = 'sakthivel@roonaa.com'
                    def abisPassword = ''
                    if (params.ENVIRONMENT == 'DEV') {
                        abisUrl = "http://dev-abis.roonaa.in:8553/admin"
                        abisPassword = withCredentials([string(credentialsId: 'abis-dev-pass', variable: 'DEV_PASS')]) {
                            return env.DEV_PASS
                        }
                    }  else if (params.ENVIRONMENT == 'FTRACK') {
                        abisUrl = "http://ftrack-abis.roonaa.in:8663/admin"
                        abisPassword = withCredentials([string(credentialsId: 'abis-ftrack-pass', variable: 'FTRACK_PASS')]) {
                            return env.FTRACK_PASS
                        }
                    } else if (params.ENVIRONMENT == 'LONGHAUL') {
                        abisUrl = "http://longhaul-abis.roonaa.in:8563/admin"
                        abisPassword = withCredentials([string(credentialsId: 'abis-longhaul-pass', variable: 'LONGHAUL_PASS')]) {
                            return env.LONGHAUL_PASS
                        }
                    } else if (params.ENVIRONMENT == 'UAT') {
                        abisUrl = "https://uat-abis.roonaa.in:8773/admin"
                        abisPassword = withCredentials([string(credentialsId: 'abis-uat-pass', variable: 'UAT_PASS')]) {
                            return env.UAT_PASS
                        }
                    }
                    echo "Environment: ${params.ENVIRONMENT}"
                    echo "ABIS_URL: ${abisUrl}"
                    echo "ABIS_USERNAME: ${abisUsername}"
                    
                    def envContent = """
                    APP_BASE_URL=${abisUrl}
                    E2E_USER=${abisUsername}
                    E2E_PASS=${abisPassword}
                    """.stripIndent()
                    writeFile file: '.env', text: envContent
                    
                    // Set for later stages if needed
                    env.ABIS_URL = abisUrl
                    env.ABIS_USERNAME = abisUsername
                    env.ABIS_PASSWORD = abisPassword
                    
                    // Update build display name with environment
                    currentBuild.displayName = "#${env.BUILD_NUMBER} - ${params.ENVIRONMENT}"
                }
            }
        }

        stage('Install Dependencies & Run abis.spec.ts') {
            steps {
                script {
                    try {
                        ansiColor('xterm') {
                            sh """
                                docker run --rm -v "${WORKSPACE}:/app" -w /app --ipc=host --network=host\
                                -e ABIS_USERNAME="${env.ABIS_USERNAME}" \
                                -e ABIS_PASSWORD="${env.ABIS_PASSWORD}" \
                                -e CI=1 \
                                -e FORCE_COLOR=1 \
                                ${PLAYWRIGHT_IMAGE} /bin/bash -c "rm -rf node_modules && npm install && npx playwright install chrome && npx playwright test -g '@sanity' --reporter=html --retries=1"
                            """
                        }
                    } catch (Exception e) {
                        echo "Test execution failed: ${e.message}"
                        currentBuild.result = 'FAILURE'
                        // Continue to next stages for report generation
                    }
                }
            }
        }

        stage('Publish HTML Report') {
            when {
                expression { return fileExists('playwright-report/index.html') }
            }
            steps {
                script {
                     publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'playwright-report',
                        reportFiles: 'index.html',
                        reportName: 'Playwright Test Report',
                        reportTitles: 'Playwright Test Results'
                    ])   
                }
            }
        }

        stage('Archive Test Artifacts') {
            when {
                expression { return fileExists('abis_execution_details.json') }
            }
            steps {
                script {
                    // Archive the execution details JSON file
                    archiveArtifacts artifacts: 'abis_execution_details.json', allowEmptyArchive: true, fingerprint: true
                }
            }
        }
    }

    post {
        always {
            script {
                def currentDate = sh(script: "TZ=Asia/Kolkata date +'%Y-%m-%d'", returnStdout: true).trim()
                def currentTime = sh(script: "TZ=Asia/Kolkata date +'%I:%M:%S %p'", returnStdout: true).trim()
                
                // Calculate execution duration
                def durationMillis = currentBuild.duration
                def durationSeconds = (durationMillis / 1000).intValue()
                def minutes = (durationSeconds / 60).intValue()
                def seconds = durationSeconds % 60
                def executionDuration = "${minutes}m ${seconds}s"
                
                // Prefer env.ABIS_URL, fallback to .env file, finally 'Not Available'
                def abisUrl = env.ABIS_URL ?: 'Not Available'
                
                // Determine test status
                def testStatus = currentBuild.result ?: 'SUCCESS'
                def statusColor = testStatus == 'SUCCESS' ? '#28a745' : '#dc3545'
                def statusIcon = testStatus == 'SUCCESS' ? '✅' : '❌'
                
                // Get build URL for HTML report
                def reportUrl = "${env.BUILD_URL}Playwright_20Test_20Report/"
                
                // Read and parse ABIS execution details JSON
                def executionDetails = [:]
                def workflowDetailsHtml = ""
                try {
                    def jsonFile = readFile('abis_execution_details.json')
                    executionDetails = readJSON text: jsonFile
                    
                    // Determine status for each workflow step
                    def leadStatus = executionDetails.lead?.name ? '✅ PASSED' : '❌ FAILED or NOT CREATED'
                    def proposalStatus = executionDetails.proposal?.proposalNumber ? '✅ PASSED' : '❌ FAILED or NOT CREATED'
                    def customerStatus = executionDetails.company?.clientId ? '✅ PASSED' : '❌ FAILED or NOT CREATED'
                    def serviceStatus = executionDetails.service?.serviceNumber ? '✅ PASSED' : '❌ FAILED or NOT CREATED'
                    def taskStatus = executionDetails.service?.task?.taskId ? '✅ PASSED' : '❌ FAILED or NOT CREATED'
                    def prepaymentStatus = executionDetails.service?.prepaymentNumber ? '✅ PASSED' : '❌ FAILED or NOT CREATED'
                    def proformaStatus = executionDetails.proforma?.proformaNumber ? '✅ PASSED' : '❌ FAILED or NOT CREATED'
                    def invoiceStatus = executionDetails.invoice?.invoiceNumber ? '✅ PASSED' : '❌ FAILED or NOT CREATED'
                    def paymentStatus = executionDetails.payment?.paymentId ? '✅ PASSED' : '❌ FAILED or NOT CREATED'
                    
                    // Extract details for each workflow step
                    def leadDetails = executionDetails.lead?.leadId ? "${executionDetails.lead.leadId} | ${executionDetails.lead.name} (${executionDetails.lead.email})" : (executionDetails.lead?.name ? "${executionDetails.lead.name} (${executionDetails.lead.email})" : 'N/A')
                    def proposalDetails = executionDetails.proposal?.proposalNumber ?: 'N/A'
                    def customerDetails = executionDetails.company?.clientId ? "${executionDetails.company.clientId} - ${executionDetails.company.company}" : 'N/A'
                    def serviceDetails = executionDetails.service?.serviceNumber ? "${executionDetails.service.serviceNumber} - ${executionDetails.service.serviceName ?: 'N/A'}" : 'N/A'
                    def taskDetails = executionDetails.service?.task?.taskId ? "${executionDetails.service.task.taskId} - ${executionDetails.service.task.taskName}" : 'N/A'
                    def prepaymentDetails = executionDetails.service?.prepaymentNumber ?: 'N/A'
                    def proformaDetails = executionDetails.proforma?.proformaNumber ?: 'N/A'
                    def invoiceDetails = executionDetails.invoice?.invoiceNumber ?: 'N/A'
                    def paymentDetails = executionDetails.payment?.paymentId ?: 'N/A'

                    // Build workflow status HTML section
                    workflowDetailsHtml = """
                        <div class="section">
                            <h2>🔄 ABIS Workflow Status</h2>
                            <table class="info-table">
                                <thead>
                                    <tr style="background-color: #007bff; color: white;">
                                        <th style="padding: 10px; text-align: left;">Workflow Step</th>
                                        <th style="padding: 10px; text-align: left;">Status</th>
                                        <th style="padding: 10px; text-align: left;">Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>Lead Creation</td>
                                        <td>${leadStatus}</td>
                                        <td>${leadDetails}</td>
                                    </tr>
                                    <tr>
                                        <td>Proposal Creation</td>
                                        <td>${proposalStatus}</td>
                                        <td>${proposalDetails}</td>
                                    </tr>
                                    <tr>
                                        <td>Customer Conversion</td>
                                        <td>${customerStatus}</td>
                                        <td>${customerDetails}</td>
                                    </tr>
                                    <tr>
                                        <td>Service Creation</td>
                                        <td>${serviceStatus}</td>
                                        <td>${serviceDetails}</td>
                                    </tr>
                                    <tr>
                                        <td>Task Creation</td>
                                        <td>${taskStatus}</td>
                                        <td>${taskDetails}</td>
                                    </tr>
                                    <tr>
                                        <td>PrePayment Creation</td>
                                        <td>${prepaymentStatus}</td>
                                        <td>${prepaymentDetails}</td>
                                    </tr>
                                    <tr>
                                        <td>Proforma Generation</td>
                                        <td>${proformaStatus}</td>
                                        <td>${proformaDetails}</td>
                                    </tr>
                                    <tr>
                                        <td>Invoice Creation</td>
                                        <td>${invoiceStatus}</td>
                                        <td>${invoiceDetails}</td>
                                    </tr>
                                    <tr>
                                        <td>Payment Recording</td>
                                        <td>${paymentStatus}</td>
                                        <td>${paymentDetails}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    """
                } catch (Exception e) {
                    workflowDetailsHtml = """
                        <div class="section">
                            <h2>🔄 ABIS Workflow Status</h2>
                            <p style="color: #dc3545;">⚠️ Unable to load workflow status: ${e.message}</p>
                        </div>
                    """
                }
                
                // Build comprehensive email body
                def emailBody = """
                    <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .header { background-color: ${statusColor}; color: white; padding: 20px; text-align: center; }
                            .content { padding: 20px; }
                            .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                            .info-table td { padding: 10px; border: 1px solid #ddd; }
                            .info-table td:first-child { background-color: #f8f9fa; font-weight: bold; width: 200px; }
                            .section { margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-left: 4px solid ${statusColor}; }
                            .section h3 { color: #007bff; margin-top: 25px; margin-bottom: 10px; }
                            .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
                            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h1>ABIS ${params.ENVIRONMENT} Sanity Test Results</h1>
                            <p>Execution Date: ${currentDate} at ${currentTime}</p>
                        </div>
                        
                        <div class="content">
                            <div class="section">
                                <h2>📊 Test Execution Summary</h2>
                                <table class="info-table">
                                    <tr>
                                        <td>Environment</td>
                                        <td><strong>${params.ENVIRONMENT}</strong></td>
                                    </tr>
                                    <tr>
                                        <td>Test Suite</td>
                                        <td>ABIS Sanity Tests (abis.spec.ts)</td>
                                    </tr>
                                    <tr>
                                        <td>Application URL</td>
                                        <td>${abisUrl}</td>
                                    </tr>
                                    <tr>
                                        <td>Test Status</td>
                                        <td><strong style="color: ${statusColor};">${testStatus}</strong></td>
                                    </tr>
                                    <tr>
                                        <td>Build Number</td>
                                        <td>#${env.BUILD_NUMBER}</td>
                                    </tr>
                                    <tr>
                                        <td>Execution Time</td>
                                        <td>${currentDate} ${currentTime} (Asia/Kolkata)</td>
                                    </tr>
                                    <tr>
                                        <td>Execution Duration</td>
                                        <td><strong>${executionDuration}</strong></td>
                                    </tr>
                                </table>
                            </div>
                            
                            ${workflowDetailsHtml}
                            
                            <div class="section">
                                <h2>📁 Detailed Reports & Logs</h2>
                                <p>Access comprehensive test execution details:</p>
                                <a href="${reportUrl}" class="button">📊 View HTML Test Report</a>
                                <a href="${env.BUILD_URL}console" class="button">📋 View Console Logs</a>
                                <p style="margin-top: 15px;"><em>The HTML report includes the detailed step-by-step execution logs.</em></p>
                            </div>
                            <div class="footer">
                                <p><strong>Note:</strong> This is an automated email from Jenkins CI/CD Pipeline.</p>
                                <p>For any questions or issues, please contact the IT team or check the Jenkins build logs.</p>
                                <p><em>Build URL: ${env.BUILD_URL}</em></p>
                            </div>
                        </div>
                    </body>
                    </html>
                """
                
                // Send email
                emailext(
                    subject: "${statusIcon} ABIS ${params.ENVIRONMENT} Sanity Test - ${testStatus} - ${currentDate} ${currentTime}",
                    to: EMAIL_NOTIFICATION,
                    body: emailBody,
                    mimeType: 'text/html',
                    attachLog: false
                )
                
                // Cleanup Docker resources after execution
                echo 'Stopping and removing all containers (images will NOT be removed)...'
                sh '''
                    # Stop all running containers
                    docker ps -q | xargs -r docker stop || true

                    # Remove all containers (including stopped)
                    docker ps -aq | xargs -r docker rm || true

                    # Show remaining images and disk usage
                    echo "Remaining Docker images:"
                    docker images || true
                    echo "Docker disk usage after container cleanup:"
                    docker system df || true

                    echo "Container cleanup completed successfully"
                '''
            }
        }
    }
}
