pipeline {
    agent any

    environment {
        PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.50.0-jammy'
        ABIS_UAT_URL="https://uat-abis.roonaa.in:8773/admin"
        ABIS_UAT_USERNAME = "sakthivel@roonaa.com"
        ABIS_UAT_PASSWORD = credentials('abis-uat-pass')
        EMAIL_NOTIFICATION = "sakthivel@roonaa.com"

    }
    stages {
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
        
        stage('Create .env file') {
            steps {
                script {
                    writeFile file: '.env', text: """
                                    APP_BASE_URL="${env.ABIS_UAT_URL}"
                                    E2E_USER="${env.ABIS_UAT_USERNAME}"
                                    E2E_PASS="${env.ABIS_UAT_PASSWORD}"
                                    """
                }
            }
        }
        stage('Install Dependencies & Run abis.spec.ts') {
            steps {
                script {
                    sh """
                        docker run --rm -v "${WORKSPACE}:/app" -w /app --ipc=host --network=host\
                        -e ABIS_UAT_USERNAME="${ABIS_UAT_USERNAME}" \
                        -e ABIS_UAT_PASSWORD="${ABIS_UAT_PASSWORD}" \
                        ${PLAYWRIGHT_IMAGE} /bin/bash -c "rm -rf node_modules && npm install && npx playwright install && npx playwright test abis.spec.ts --reporter=line"
                        """
                }
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
                            subject: "UAT Sanity Status on ${currentDate} at ${currentTime}",
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
                
