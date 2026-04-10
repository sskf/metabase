git reset HEAD~1
rm ./backport.sh
git cherry-pick f57e7585ccbe1619749a9a150a8a75441608a10b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
