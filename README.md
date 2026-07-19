

## Servenaija

### Brief Section


### Pre-requisite

To clone this repository, you can head over to [GitHub Repository](https://github.com/servenaija/servenaija-API). the major requirements for this API is shown below

- NodeJS (npm)
- mongoDB
- .env (Environment Variables)

| Variable | Data Type | Allowed Values  |
| ----------- | ----------- | ----------- |
| PORT | Number | Default: 3000 |
| BASE_URL | String | the url for hosting the API |
| NODE_ENV | String | production&nbsp;\|&nbsp; development |
| DB_URL | String | mongo url |
| JWT_SECRET | String | any |
| JWT_ACCESS_EXPIRATION_MINUTES | Number | any |
| JWT_REFRESH_EXPIRATION_DAYS | Number | any |
| JWT_RESET_PASSWORD_EXPIRATION_MINUTES | Number | any |
| JWT_VERIFY_EMAIL_EXPIRATION_MINUTES | Number | any |
| SMTP_HOST | String | eg: smtp.gmail.com |
| SMTP_PORT | Number | 465 |
| SMTP_USERNAME | String | any |
| SMTP_PASSWORD | String | any |
| EMAIL_FROM | String | any |

> These variables are required and the API cannot start without them! :joy:

### Starting the API
first run `npm install` to install the necessary dependencies

after the dependencies are installed, type `npm start` and visit the version 1.0 from `http://localhost:{port}/v1.0/`. default port is `3000`

### Current Available Endpoints

> All endpoints accept JSON objects and returns JSON objects
> All admin endpoints can only be accesed by admin level users, so in order to test that create an extra user and set the userRole to admin


| endpoint | method | request payload |
| --- | --- | --- |
| Auth | Auth | Auth |
| /v1.0/auth/register | POST | <pre>`Request Body`<br><br>{<br>&nbsp;&nbsp;<span style="color: green;">"email", </span><span> :</span><span style="color: red;">required</span><br>&nbsp;&nbsp;<span style="color: green;">"password", </span><span> :</span><span style="color: red;">required</span><br>&nbsp;&nbsp;<span style="color: green;">"firstName", </span><span> :</span><span style="color: red;">required</span><br>&nbsp;&nbsp;<span style="color: green;">"lastName", </span><span> :</span><span style="color: red;">required</span><br>&nbsp;&nbsp;<span style="color: green;">"gender", </span><span> :</span><span style="color: red;">required</span><br>}</pre> |
| /v1.0/auth/login | POST | <pre>`Request Body`<br><br>{<br>&nbsp;&nbsp;<span style="color: green;">"email", </span><span> :</span><span style="color: red;">required</span><br>&nbsp;&nbsp;<span style="color: green;">"password", </span><span> :</span><span style="color: red;">required</span><br>}</pre> |
| /v1.0/auth/logout | POST | <pre>`Request Body`<br><br>{<br>&nbsp;&nbsp;<span style="color: green;">"refreshToken", </span><span> :</span><span style="color: red;">required</span><br>}</pre> |
| /v1.0/auth/refresh-tokens | POST | <pre>`Request Body`<br><br>{<br>&nbsp;&nbsp;<span style="color: green;">"refreshToken", </span><span> :</span><span style="color: red;">required</span><br>}</pre> |
| /v1.0/auth/forgot-password | POST | <pre>`Request Body`<br><br>{<br>&nbsp;&nbsp;<span style="color: green;">"email", </span><span> :</span><span style="color: red;">required</span><br>}</pre> |
| /v1.0/auth/reset-password | POST | <pre>`Request Body`<br><br>{<br>&nbsp;&nbsp;<span style="color: green;">"password", </span><span> :</span><span style="color: red;">required</span><br>}<br><br>`Request Query`<br><br>{<br>&nbsp;&nbsp;<span style="color: green;">"token", </span><span> :</span><span style="color: red;">required</span><br>}</pre> |
| /v1.0/auth/send-verification-email | POST | <pre>`Request Query`<br><br>{<br>&nbsp;&nbsp;<span style="color: green;">"token", </span><span> :</span><span style="color: red;">required</span><br>}</pre> |
| /v1.0/auth/verify-email | POST | <pre>`Request Query`<br><br>{<br>&nbsp;&nbsp;<span style="color: green;">"token", </span><span> :</span><span style="color: red;">required</span><br>}</pre> |
| Admins | Admins | Admins |
| /v1.0/admins/users | GET | <pre>`Request Query`<br><br>{<br>&nbsp;&nbsp;<span style="color: green;">"page</span><span> :</span><span style="color: red;">required</span><br>&nbsp;&nbsp;<span style="color: green;">"limit", </span><span> :</span><span style="color: red;">required</span><br>}</pre> |
| /v1.0/admins/users | POST | <pre>`Request Body`<br><br>{<br>&nbsp;&nbsp;<span style="color: green;">"email", </span><span> :</span><span style="color: red;">required</span><br>&nbsp;&nbsp;<span style="color: green;">"password", </span><span> :</span><span style="color: red;">required</span><br>&nbsp;&nbsp;<span style="color: green;">"firstName", </span><span> :</span><span style="color: red;">required</span><br>&nbsp;&nbsp;<span style="color: green;">"lastName", </span><span> :</span><span style="color: red;">required</span><br>&nbsp;&nbsp;<span style="color: green;">"gender", </span><span> :</span><span style="color: red;">required</span><br>}</pre> |




### Security Checklist

- [x] SQL Injection
- [x] Authentication
- [x] Authorization
- [x] UUID
- [x] Rate Limiting
- [x] Content Labeling
- [x] MIME sniffing
- [x] Force Secure Connection
- [x] Embedding Prevention
- [x] Security Policies
- [x] Content-Type specification
- [x] Method limiting
- [x] Request Validation

### Team



&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&n

![mustafa](https://avatars.githubusercontent.com/u/94189602?v=4)


 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [Mustafa Madiba](https://github.com/mustafadevop)

### Enquiries


[^1]: Happy coding :wave:







