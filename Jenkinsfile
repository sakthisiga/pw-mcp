pipeline {
    agent any

    parameters {
        choice(name: 'ENVIRONMENT', choices: ['DEV', 'LONGHAUL'], description: 'Select environment')
    }

    environment {
        PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.56.0-jammy'
        EMAIL_NOTIFICATION = "sakthivel@roonaa.com"
        // Default values, will be overwritten in 'Set Environment Variables' stage
        ABIS_URL = ''
        ABIS_USERNAME = ''
        ABIS_PASSWORD = ''
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
                    branches: [[name: '*/externalized-helpers']],
                    userRemoteConfigs: [[
                        url: 'git@github.com:sakthisiga/pw-mcp.git'
                    ]]
                ])
            }
        }
        stage('Install Dependencies & Run abis.spec.ts') {
            steps {
                script {
                    sh """
                        docker run --rm -v "${WORKSPACE}:/app" -w /app --ipc=host --network=host\
                        -e ABIS_USERNAME="${env.ABIS_USERNAME}" \
                        -e ABIS_PASSWORD="${env.ABIS_PASSWORD}" \
                        -e CI=1 \
                        ${PLAYWRIGHT_IMAGE} /bin/bash -c "rm -rf node_modules && npm install && npx playwright install chrome && CI=1 npx playwright test tests/abis.spec.ts --reporter=html || exit 1"
                    """
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

        stage('Send Email') {
            steps {
                script {
                    def currentDate = sh(script: "TZ=Asia/Kolkata date +'%Y-%m-%d'", returnStdout: true).trim()
                    def currentTime = sh(script: "TZ=Asia/Kolkata date +'%I:%M:%S %p'", returnStdout: true).trim()
                    def imagePath = "screenshots/overview_page.png,screenshots/metabase_page.png"
                    def emailBody = """
                        <p>Hello Team,</p>
                        <p>Please find the Overview and Metabase Status on ${currentDate} at ${currentTime}:</p>"""
                    emailext(
                        subject: "${params.ENVIRONMENT} Sanity Status on ${currentDate} at ${currentTime}",
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
