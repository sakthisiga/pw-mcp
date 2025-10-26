pipeline {
    agent any

    parameters {
        choice(name: 'ENVIRONMENT', choices: ['DEV', 'LONGHAUL'], description: 'Select environment')
    }

    environment {
        PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.56.0-jammy'
        EMAIL_NOTIFICATION = "sakthivel@roonaa.com,abirami@roonaa.com"
    }

    stages {
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
                    } else if (params.ENVIRONMENT == 'LONGHAUL') {
                        abisUrl = "http://longhaul-abis.roonaa.in:8563/admin"
                        abisPassword = withCredentials([string(credentialsId: 'abis-longhaul-pass', variable: 'LONGHAUL_PASS')]) {
                            return env.LONGHAUL_PASS
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
                    sh 'cat .env'
                    
                    // Set for later stages if needed
                    env.ABIS_URL = abisUrl
                    env.ABIS_USERNAME = abisUsername
                    env.ABIS_PASSWORD = abisPassword
                }
            }
        }

        stage('Checkout') {
            steps {
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: '*/main']],
                    userRemoteConfigs: [[
                        url: 'git@github.com:sakthisiga/pw-mcp.git'
                    ]]
                ])
            }
        }

        stage('Clean Docker Resources') {
            steps {
                script {
                    echo 'Cleaning up Docker containers and images...'
                    sh '''
                        # Stop and remove all running containers
                        docker ps -q | xargs -r docker stop || true
                        docker ps -aq | xargs -r docker rm || true
                        
                        # Clean up dangling images and build cache
                        docker system prune -af --volumes || true
                        
                        echo "Docker cleanup completed"
                    '''
                }
            }
        }

        stage('Install Dependencies & Run abis.spec.ts') {
            steps {
                script {
                    ansiColor('xterm') {
                        sh """
                            docker run --rm -v "${WORKSPACE}:/app" -w /app --ipc=host --network=host\
                            -e ABIS_USERNAME="${env.ABIS_USERNAME}" \
                            -e ABIS_PASSWORD="${env.ABIS_PASSWORD}" \
                            -e CI=1 \
                            -e FORCE_COLOR=1 \
                            ${PLAYWRIGHT_IMAGE} /bin/bash -c "rm -rf node_modules && npm install && npx playwright install chrome && npx playwright test -g '@sanity' --reporter=html || exit 1"
                        """
                    }
                }
            }
        }

        stage('Publish HTML Report') {
            steps {
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

        stage('Archive Test Artifacts') {
            steps {
                script {
                    // Archive the execution details JSON file
                    archiveArtifacts artifacts: 'abis_execution_details.json', allowEmptyArchive: true, fingerprint: true
                }
            }
        }

        stage('Send Email') {
            steps {
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
                                .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
                                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
                            </style>
                        </head>
                        <body>
                            <div class="header">
                                <h1>${statusIcon} ABIS ${params.ENVIRONMENT} Sanity Test Results</h1>
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
                                
                                <div class="section">
                                    <h2>📁 Detailed Reports & Logs</h2>
                                    <p>Access comprehensive test execution details:</p>
                                    <a href="${reportUrl}" class="button">📊 View HTML Test Report</a>
                                    <a href="${env.BUILD_URL}console" class="button">📋 View Console Logs</a>
                                    <p style="margin-top: 15px;"><em>The HTML report includes screenshots, videos, trace files, and detailed step-by-step execution logs.</em></p>
                                </div>
                                <div class="footer">
                                    <p><strong>Note:</strong> This is an automated email from Jenkins CI/CD Pipeline.</p>
                                    <p>For any questions or issues, please contact the QA team or check the Jenkins build logs.</p>
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
                }
            }
        }
    }
}
