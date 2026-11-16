\set ON_ERROR_STOP on
\getenv runtime_password MSM2_RUNTIME_PASSWORD
\getenv migrator_password MSM2_MIGRATOR_PASSWORD

-- 비밀 값이 없거나 너무 짧으면 역할·DB를 만들기 전에 실패한다.
SELECT 1 / ((length(:'runtime_password') >= 32 AND length(:'migrator_password') >= 32)::integer);

-- 기존 역할의 비밀번호는 덮어쓰지 않는다. 같은 환경 파일로 재실행할 수 있다.
SELECT format(
    'CREATE ROLE msm2_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
    :'migrator_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'msm2_migrator')
\gexec

SELECT format(
    'CREATE ROLE msm2_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
    :'runtime_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'msm2_runtime')
\gexec

SELECT 'CREATE DATABASE msm2_main OWNER msm2_migrator'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'msm2_main')
\gexec

-- 이름이 같은 기존 DB나 특권 역할을 잘못 재사용하지 않는다.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_database
        WHERE datname = 'msm2_main' AND pg_get_userbyid(datdba) <> 'msm2_migrator'
    ) OR EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname IN ('msm2_migrator', 'msm2_runtime')
            AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
    ) THEN
        RAISE EXCEPTION '기존 MSM2 DB 소유자와 역할 권한을 확인해 주세요.';
    END IF;
END
$$;

REVOKE ALL ON DATABASE msm2_main FROM PUBLIC;
GRANT CONNECT ON DATABASE msm2_main TO msm2_runtime;

\connect msm2_main

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO msm2_runtime;

-- 이후 실제 migration으로 만드는 객체에도 런타임의 업무 권한만 부여한다.
ALTER DEFAULT PRIVILEGES FOR ROLE msm2_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO msm2_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE msm2_migrator IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO msm2_runtime;
