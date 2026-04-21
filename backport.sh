git reset HEAD~1
rm ./backport.sh
git cherry-pick 0dfe41db2aeed63ad0edd6daa894b9b69dd7a2d9
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
